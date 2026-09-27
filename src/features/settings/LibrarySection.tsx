import { useEffect, useState } from 'react';
import type { Platform, LibraryInfo, BackupInfo } from '@/platform';
import { Button } from '@/design/components';
import { TrashSection } from '@/features/trash/TrashSection';
import { useToastStore } from '@/state/toastStore';
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
  const isTauri = platform.kind === 'tauri';

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
      const info = await platform.backups.now();
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
            {backups && backups.length === 0 && (
              <p style={{ color: 'var(--text-2)' }}>{en.settings.library.noBackupsYet}</p>
            )}
            {backups && backups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {backups.map((b) => (
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
        </>
      ) : (
        <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
          {en.settings.library.notAvailableInBrowser}
        </p>
      )}

      <TrashSection platform={platform} />
    </div>
  );
}
