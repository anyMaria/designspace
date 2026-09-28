import { useState } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import { ensureLibraryReady } from '@/platform/bootstrap';
import { seedVocabulary } from '@/state/vocabularySeed';
import { loadVocabulary } from '@/state/loadVocabulary';
import { loadBoards } from '@/state/loadBoards';
import { loadFramesForBoard } from '@/state/loadLibrary';
import { useBoardStore } from '@/state/boardStore';
import { importPaths } from '@/features/import/importItems';
import { en } from '@/i18n/en';
import { Button } from '@/design/components';
import { logger } from '@/lib/logger';
import { looksCloudSynced } from './cloudSync';

export interface OnboardingProps {
  platform: Platform;
  onReady: (library: LibraryInfo, libraryBoardId: string) => void;
}

type Step = 'welcome' | 'bringIn';

/** First run, §2.14 steps 1–3: welcome + library location, then "Bring in existing inspiration?"
 * (pick folders, or Skip) before landing on the empty map. */
export function Onboarding({ platform, onReady }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryInfo | null>(null);
  const [libraryBoardId, setLibraryBoardId] = useState<string | null>(null);
  const [pickedFolders, setPickedFolders] = useState<string[]>([]);
  const [pickedCount, setPickedCount] = useState(0);

  async function browse() {
    const folder = await platform.dialogs.openFolder();
    if (folder) setPath(folder);
  }

  async function createLibrary() {
    setBusy(true);
    setError(null);
    try {
      const createdLibrary = await platform.library.create(path ?? undefined);
      const boardId = await ensureLibraryReady(platform);
      await seedVocabulary(platform);
      await loadVocabulary(platform);
      await loadBoards(platform);
      await loadFramesForBoard(platform, boardId);
      useBoardStore.getState().setCurrentBoardId(boardId);
      setLibrary(createdLibrary);
      setLibraryBoardId(boardId);
      setBusy(false);
      // Folder picking (media.listFolder/dialogs.openFolder) is Tauri-only (§4.5) — the browser
      // dev build has nothing to bring in here, so it skips straight to the empty map.
      if (platform.kind === 'tauri') {
        setStep('bringIn');
      } else {
        onReady(createdLibrary, boardId);
      }
    } catch (err) {
      logger.error('Failed to create the library', err);
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function pickInspirationFolder(): Promise<void> {
    const dir = await platform.dialogs.openFolder();
    if (!dir || pickedFolders.includes(dir)) return;
    const listing = await platform.media.listFolder(dir);
    setPickedFolders((prev) => [...prev, dir]);
    setPickedCount((prev) => prev + listing.paths.length);
  }

  async function finishBringIn(): Promise<void> {
    if (!library || !libraryBoardId) return;
    setBusy(true);
    try {
      for (const dir of pickedFolders) {
        const listing = await platform.media.listFolder(dir);
        if (listing.paths.length > 0) await importPaths(platform, listing.paths, { x: 0, y: 0 });
      }
      onReady(library, libraryBoardId);
    } catch (err) {
      logger.error('Failed to bring in existing inspiration', err);
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function skipBringIn(): void {
    if (!library || !libraryBoardId) return;
    onReady(library, libraryBoardId);
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--canvas)',
      }}
    >
      <div
        className="ds-panel"
        style={{
          padding: 'var(--space-6)',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {step === 'welcome' ? (
          <>
            <h1 className="font-display" style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>
              {en.onboarding.welcomeTitle}
            </h1>
            <p style={{ margin: 0, color: 'var(--text-2)' }}>{en.onboarding.welcomeBody}</p>

            <div>
              <h2 style={{ fontSize: 'var(--text-md)', margin: '0 0 var(--space-2)' }}>
                {en.onboarding.libraryLocationTitle}
              </h2>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-2)', flex: 1, wordBreak: 'break-all' }}>
                  {path ?? en.onboarding.libraryLocationDefault}
                </span>
                <Button variant="secondary" onClick={() => void browse()}>
                  {en.onboarding.browse}
                </Button>
              </div>
              {path && looksCloudSynced(path) && (
                <p style={{ color: 'var(--accent)', fontSize: 'var(--text-sm)' }}>
                  {en.onboarding.cloudWarning}
                </p>
              )}
            </div>

            {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

            <Button variant="primary" disabled={busy} onClick={() => void createLibrary()}>
              {en.onboarding.createLibrary}
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-display" style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>
              {en.onboarding.bringInTitle}
            </h1>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void pickInspirationFolder()}
            >
              {en.addMenu.folder}
            </Button>
            {pickedFolders.length > 0 && (
              <p style={{ margin: 0, color: 'var(--text-2)' }}>
                {en.onboarding.foldersPicked(pickedFolders.length, pickedCount)}
              </p>
            )}

            {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" disabled={busy} onClick={skipBringIn}>
                {en.onboarding.skip}
              </Button>
              <Button
                variant="primary"
                disabled={busy || pickedFolders.length === 0}
                onClick={() => void finishBringIn()}
              >
                {en.onboarding.continue}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
