import { useEffect, useState, type ReactNode } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import { getPlatform } from '@/platform';
import { ensureLibraryReady, readDevUrlFlags } from '@/platform/bootstrap';
import { seedDemoLibrary } from '@/platform/seed/demo';
import { mergeFontFamilies } from '@/db/repairs/mergeFontFamilies';
import { loadVocabulary } from '@/state/loadVocabulary';
import { seedVocabulary } from '@/state/vocabularySeed';
import { loadManualConnections } from '@/state/loadManualConnections';
import { loadBoards } from '@/state/loadBoards';
import { useBoardStore } from '@/state/boardStore';
import { resumePendingIngest } from '@/workers/ingestQueue';
import { resumePendingVideoIngest } from '@/workers/videoIngestQueue';
import { resumePendingPdfIngest } from '@/workers/pdfIngestQueue';
import { resumePendingFontIngest } from '@/workers/fontIngestQueue';
import { resumePendingLinkIngest } from '@/features/import/importLink';
import { offerLinkPictureLookup } from '@/features/import/linkPicture';
import { loadSettings } from '@/state/loadSettings';
import { loadMachineSettings, startMachineSettingsPersistence } from '@/state/loadMachineSettings';
import { purgeExpiredTrash } from '@/features/trash/trashActions';
import { maybeBackupAtStartup } from '@/features/backups/autoBackup';
import { logger } from '@/lib/logger';
import { useToastStore } from '@/state/toastStore';
import { useUiStore } from '@/state/uiStore';
import { setFullscreen } from './fullscreen';
import { en } from '@/i18n/en';
import { loadLibraryItems } from '@/state/loadLibrary';
import { useReducedMotionSync } from '@/lib/useReducedMotionSync';
import { DesignPage } from '@/design/DesignPage';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Shell } from './Shell';
import { escapeStack, installEscapeListener } from './escapeStack';
import { watchFullscreen } from './fullscreen';
import { isTypingTarget } from '@/lib/isTypingTarget';
import { requeueMissingThumbnails } from '@/workers/missingThumbnails';

type BootState =
  | { phase: 'loading' }
  | { phase: 'needs-library'; platform: Platform }
  | {
      phase: 'ready';
      platform: Platform;
      library: LibraryInfo;
      libraryBoardId: string;
      benchCount: number | null;
    }
  | { phase: 'error'; message: string };

const REFRESH_TOAST_THRESHOLD = 20;

/** Re-queues unfinished or outdated derivatives for every kind, and says so when it's a lot of
 * work (the one-off Patch 1 repair re-makes every preview). */
async function resumeAllIngest(platform: Platform): Promise<void> {
  try {
    await requeueMissingThumbnails(platform);
    const counts = await Promise.all([
      resumePendingIngest(platform),
      resumePendingVideoIngest(platform),
      resumePendingPdfIngest(platform),
      resumePendingFontIngest(platform),
      resumePendingLinkIngest(platform),
    ]);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > REFRESH_TOAST_THRESHOLD)
      useToastStore.getState().show(en.patch1.refreshingPreviews(total));
  } catch (err) {
    logger.error('Resuming ingest failed', err);
  }
}

export function App() {
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  useReducedMotionSync();

  // One Esc listener for the whole app (Patch 2 · C1); layers and base handlers register on the stack.
  useEffect(() => installEscapeListener(window, isTypingTarget), []);

  // Full screen follows the window (the browser's own Esc leaves it too); with nothing else to
  // close, Esc leaves it (priority 15: after cancelling a mode, before clearing the selection).
  const platformForEsc = boot.phase === 'ready' ? boot.platform : null;
  useEffect(() => {
    if (!platformForEsc) return;
    const unwatch = watchFullscreen(platformForEsc);
    const removeBase = escapeStack.addBase(15, () => {
      if (!useUiStore.getState().fullscreen) return false;
      void setFullscreen(platformForEsc, false);
      return true;
    });
    return () => {
      unwatch();
      removeBase();
    };
  }, [platformForEsc]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const platform = await getPlatform();
        await loadMachineSettings(platform);
        startMachineSettingsPersistence(platform);
        const recent = await platform.library.recent();

        if (platform.kind === 'browser') {
          // §2.14 / §4.5: the browser dev build always has an automatic library, no onboarding.
          const library = await platform.library.open();
          const libraryBoardId = await ensureLibraryReady(platform);
          await mergeFontFamilies(platform);
          const { seedDemo, bench } = readDevUrlFlags();
          await seedVocabulary(platform);
          if (seedDemo) await seedDemoLibrary(platform, libraryBoardId);
          await Promise.all([
            loadLibraryItems(platform, libraryBoardId),
            loadVocabulary(platform),
            loadManualConnections(platform),
            loadBoards(platform),
            loadSettings(platform),
          ]);
          useBoardStore.getState().setCurrentBoardId(libraryBoardId);
          void resumeAllIngest(platform);
          void purgeExpiredTrash(platform);
          if (!cancelled)
            setBoot({ phase: 'ready', platform, library, libraryBoardId, benchCount: bench });
          return;
        }

        if (recent.length === 0) {
          if (!cancelled) setBoot({ phase: 'needs-library', platform });
          return;
        }
        const library = await platform.library.open(recent[0].path);
        const libraryBoardId = await ensureLibraryReady(platform);
        await mergeFontFamilies(platform);
        void platform.cache.pruneOrphans();
        await seedVocabulary(platform);
        await Promise.all([
          loadLibraryItems(platform, libraryBoardId),
          loadVocabulary(platform),
          loadManualConnections(platform),
          loadBoards(platform),
          loadSettings(platform),
        ]);
        useBoardStore.getState().setCurrentBoardId(libraryBoardId);
        void resumeAllIngest(platform);
        void purgeExpiredTrash(platform);
        void offerLinkPictureLookup(platform);
        void maybeBackupAtStartup(platform);
        if (platform.kind === 'tauri' && useUiStore.getState().startFullscreen)
          void setFullscreen(platform, true);
        if (!cancelled)
          setBoot({ phase: 'ready', platform, library, libraryBoardId, benchCount: null });
      } catch (err) {
        logger.error('Failed to start Designspace', err);
        if (!cancelled) {
          setBoot({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  if (window.location.pathname === '/design') {
    return <DesignPage />;
  }

  switch (boot.phase) {
    case 'loading':
      return <CenteredMessage>Loading…</CenteredMessage>;
    case 'error':
      return (
        <CenteredMessage>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              alignItems: 'center',
              textAlign: 'center',
              maxWidth: 480,
            }}
          >
            <p style={{ margin: 0 }}>{en.errors.startupFailed}</p>
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
              {en.errors.startupFailedHint}
            </p>
            <p
              style={{
                margin: 0,
                color: 'var(--text-3)',
                fontSize: 'var(--text-xs)',
                wordBreak: 'break-word',
              }}
            >
              {boot.message}
            </p>
          </div>
        </CenteredMessage>
      );
    case 'needs-library':
      return (
        <Onboarding
          platform={boot.platform}
          onReady={(library, libraryBoardId) =>
            setBoot({
              phase: 'ready',
              platform: boot.platform,
              library,
              libraryBoardId,
              benchCount: null,
            })
          }
        />
      );
    case 'ready':
      return (
        <Shell
          platform={boot.platform}
          library={boot.library}
          libraryBoardId={boot.libraryBoardId}
          benchCount={boot.benchCount}
        />
      );
  }
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)',
      }}
    >
      {children}
    </div>
  );
}
