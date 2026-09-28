import { useEffect, useState, type ReactNode } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import { getPlatform } from '@/platform';
import { ensureLibraryReady, readDevUrlFlags } from '@/platform/bootstrap';
import { seedDemoLibrary } from '@/platform/seed/demo';
import { loadLibraryItems, loadFramesForBoard } from '@/state/loadLibrary';
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
import { loadSettings } from '@/state/loadSettings';
import { purgeExpiredTrash } from '@/features/trash/trashActions';
import { maybeBackupAtStartup } from '@/features/backups/autoBackup';
import { logger } from '@/lib/logger';
import { DesignPage } from '@/design/DesignPage';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Shell } from './Shell';

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

export function App() {
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const platform = await getPlatform();
        const recent = await platform.library.recent();

        if (platform.kind === 'browser') {
          // §2.14 / §4.5: the browser dev build always has an automatic library, no onboarding.
          const library = await platform.library.open();
          const libraryBoardId = await ensureLibraryReady(platform);
          const { seedDemo, bench } = readDevUrlFlags();
          await seedVocabulary(platform);
          if (seedDemo) await seedDemoLibrary(platform, libraryBoardId);
          await Promise.all([
            loadLibraryItems(platform, libraryBoardId),
            loadVocabulary(platform),
            loadManualConnections(platform),
            loadBoards(platform),
            loadFramesForBoard(platform, libraryBoardId),
            loadSettings(platform),
          ]);
          useBoardStore.getState().setCurrentBoardId(libraryBoardId);
          void resumePendingIngest(platform);
          void resumePendingVideoIngest(platform);
          void resumePendingPdfIngest(platform);
          void resumePendingFontIngest(platform);
          void resumePendingLinkIngest(platform);
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
        await seedVocabulary(platform);
        await Promise.all([
          loadLibraryItems(platform, libraryBoardId),
          loadVocabulary(platform),
          loadManualConnections(platform),
          loadBoards(platform),
          loadFramesForBoard(platform, libraryBoardId),
          loadSettings(platform),
        ]);
        useBoardStore.getState().setCurrentBoardId(libraryBoardId);
        void resumePendingIngest(platform);
        void resumePendingVideoIngest(platform);
        void resumePendingPdfIngest(platform);
        void resumePendingFontIngest(platform);
        void resumePendingLinkIngest(platform);
        void purgeExpiredTrash(platform);
        void maybeBackupAtStartup(platform);
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
      return <CenteredMessage>Couldn't start Designspace: {boot.message}</CenteredMessage>;
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
