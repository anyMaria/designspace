import type { Platform } from '@/platform/types';
import { logger } from '@/lib/logger';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** "They run at startup if the last one is older than 24 h" (§5.4). Best-effort: a failed backup
 * shouldn't block startup, so this only logs. The "at quit if anything changed" half needs a
 * window-close hook and dirty-tracking neither of which exist yet — deferred, logged in
 * docs/DECISIONS.md. Browser dev build has no real backups (`backups.now` is `notSupported`), so
 * this is a no-op there. */
export async function maybeBackupAtStartup(platform: Platform): Promise<void> {
  if (platform.kind !== 'tauri') return;
  try {
    const backups = await platform.backups.list();
    const newest = backups.reduce<number>(
      (latest, b) => Math.max(latest, new Date(b.createdAt).getTime()),
      0,
    );
    if (Date.now() - newest > MAX_AGE_MS) {
      await platform.backups.now();
    }
  } catch (err) {
    logger.error('Automatic startup backup failed', err);
  }
}
