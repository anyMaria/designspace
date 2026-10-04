import { useEffect, useState } from 'react';
import type { Platform, LibraryInfo, BackupInfo } from '@/platform';
import { Button } from '@/design/components';
import { useToastStore } from '@/state/toastStore';
import { useSettingsStore } from '@/state/settingsStore';
import { setBackupExtraDestination } from '@/state/loadSettings';
import { exportLibraryJson, exportLibraryZip } from '@/features/export/exportLibrary';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';

/** Settings → Library (§2.14): location, open/create another library, recent libraries, backups,
 * Trash. Switching or restoring a library reloads the app — everything in memory (stores, the
 * engine, the undo history) is scoped to the one currently open, so a clean reboot through
 * `App.tsx`'s normal boot path is simpler and safer than trying to tear it all down live. */
export function LibrarySection({
  platform,
  library,
}: {
  platform: Platform;
  library: LibraryInfo;
}) {
  const [recent, setRecent] = useState<LibraryInfo[]>([]);
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [showAllBackups, setShowAllBackups] = useState(false);
  const isTauri = platform.kind === 'tauri';
  const extraDestination = useSettingsStore((s) => s.backupExtraDestination);

  useEffect(() => {
    if (!isTauri) return;
    void platform.library.recent().then(setRecent);
    void platform.backups.list().then(setBackups);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- platform is stable for the app's lifetime
  }, []);

  async function openOrCreate(): Promise<void> {
    const dir = await platform.dialogs.openFolder();
    if (!dir) return;
    await platform.library.open(dir);
    window.location.reload();
  }

  async function switchTo(path: string): Promise<void> {
    await platform.library.open(path);
    window.location.reload();
  }

  async function backupNow(): Promise<void> {
    try {
      const info = await platform.backups.now(extraDestination);
      setBackups((prev) => [info, ...(prev ?? [])]);
      useToastStore.getState().show(en.settings.library.backupNowSucceeded);
    } catch (err) {
      logger.error('Backup now failed', err);
      useToastStore.getState().show(en.settings.library.backupNowFailed);
    }
  }

  async function restore(id: string): Promise<void> {
    if (!window.confirm(en.settings.library.restoreConfirm)) return;
    await platform.backups.restore(id);
    window.location.reload();
  }

  async function chooseExtraDestination(): Promise<void> {
    const dir = await platform.dialogs.openFolder();
    if (!dir) return;
    await setBackupExtraDestination(platform, dir);
  }

  async function clearExtraDestination(): Promise<void> {
    await setBackupExtraDestination(platform, null);
  }

  async function runExport(fn: (platform: Platform) => Promise<boolean>): Promise<void> {
    try {
      const saved = await fn(platform);
      useToastStore
        .getState()
        .show(saved ? en.settings.library.exportSucceeded : en.settings.library.exportCancelled);
    } catch (err) {
      logger.error('Library export failed', err);
      useToastStore.getState().show(en.settings.library.exportFailed);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-md)' }}>
          {en.settings.library.location}
        </h3>
        <p style={{ margin: 0, color: 'var(--text-2)', wordBreak: 'break-all' }}>{library.path}</p>
      </div>

      {isTauri ? (
        <>
          <Button variant="secondary" onClick={() => void openOrCreate()}>
            {en.settings.library.openOrCreate}
          </Button>

          {recent.length > 1 && (
            <div>
              <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-md)' }}>
                {en.settings.library.recentLibraries}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {recent
                  .filter((l) => l.path !== library.path)
                  .map((l) => (
                    <button
                      key={l.path}
                      type="button"
                      className="ds-menu__item"
                      onClick={() => void switchTo(l.path)}
                    >
                      {l.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>
                {en.settings.library.backups}
              </h3>
              <Button variant="ghost" onClick={() => void backupNow()}>
                {en.settings.library.backupNow}
              </Button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--space-2)',
              }}
            >
              <span style={{ color: 'var(--text-2)', fontSize: 13, wordBreak: 'break-all' }}>
                {extraDestination
                  ? en.settings.library.extraDestinationSet(extraDestination)
                  : en.settings.library.extraDestinationUnset}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <Button variant="ghost" onClick={() => void chooseExtraDestination()}>
                  {en.settings.library.extraDestinationChoose}
                </Button>
                {extraDestination && (
                  <Button variant="ghost" onClick={() => void clearExtraDestination()}>
                    {en.settings.library.extraDestinationClear}
                  </Button>
                )}
              </div>
            </div>
            {backups && backups.length === 0 && (
              <p style={{ color: 'var(--text-2)' }}>{en.settings.library.noBackupsYet}</p>
            )}
            {backups && backups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'var(--text-2)' }}>
                    {en.settings.library.backupsSummary(
                      new Date(backups[0].createdAt).toLocaleString(),
                      backups.length,
                    )}
                  </span>
                  {backups.length > 1 && (
                    <Button variant="ghost" onClick={() => setShowAllBackups((v) => !v)}>
                      {showAllBackups
                        ? en.settings.library.showFewerBackups
                        : en.settings.library.showAllBackups(backups.length)}
                    </Button>
                  )}
                </div>
                {(showAllBackups ? backups : []).map((b) => (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>
                      {new Date(b.createdAt).toLocaleString()}
                    </span>
                    <Button variant="ghost" onClick={() => void restore(b.id)}>
                      {en.settings.library.restore}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-md)' }}>
              {en.settings.library.export}
            </h3>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <Button variant="secondary" onClick={() => void runExport(exportLibraryJson)}>
                {en.settings.library.exportJson}
              </Button>
              <Button variant="secondary" onClick={() => void runExport(exportLibraryZip)}>
                {en.settings.library.exportZip}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
          {en.settings.library.notAvailableInBrowser}
        </p>
      )}
    </div>
  );
}
