import { describe, expect, it, vi } from 'vitest';
import { maybeBackupAtStartup } from './autoBackup';
import type { Platform } from '@/platform/types';

function makePlatform(kind: Platform['kind'], list: { createdAt: string }[]): Platform {
  return {
    kind,
    backups: {
      list: vi.fn().mockResolvedValue(list),
      now: vi.fn().mockResolvedValue({
        id: 'x',
        path: 'x',
        createdAt: new Date().toISOString(),
        sizeBytes: 0,
      }),
      restore: vi.fn(),
    },
  } as unknown as Platform;
}

describe('maybeBackupAtStartup', () => {
  it('is a no-op on the browser platform', async () => {
    const platform = makePlatform('browser', []);
    await maybeBackupAtStartup(platform);
    expect(platform.backups.list).not.toHaveBeenCalled();
  });

  it('backs up when there are no backups yet', async () => {
    const platform = makePlatform('tauri', []);
    await maybeBackupAtStartup(platform);
    expect(platform.backups.now).toHaveBeenCalled();
  });

  it('backs up when the newest backup is older than 24 hours', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const platform = makePlatform('tauri', [{ createdAt: old }]);
    await maybeBackupAtStartup(platform);
    expect(platform.backups.now).toHaveBeenCalled();
  });

  it('skips backing up when the newest backup is under 24 hours old', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const platform = makePlatform('tauri', [{ createdAt: recent }]);
    await maybeBackupAtStartup(platform);
    expect(platform.backups.now).not.toHaveBeenCalled();
  });

  it("doesn't throw if backing up fails", async () => {
    const platform = makePlatform('tauri', []);
    vi.mocked(platform.backups.now).mockRejectedValue(new Error('disk full'));
    await expect(maybeBackupAtStartup(platform)).resolves.toBeUndefined();
  });
});
