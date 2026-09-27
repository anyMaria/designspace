import { describe, expect, it, vi } from 'vitest';
import { deleteForever, listTrashedItems, purgeExpiredTrash } from './trashActions';
import type { Platform } from '@/platform/types';

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  const base = {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
    media: {
      importPaths: vi.fn(),
      importFile: vi.fn(),
      importBytes: vi.fn(),
      importUrl: vi.fn(),
      originalUrl: vi.fn(),
      reveal: vi.fn(),
      purge: vi.fn().mockResolvedValue(undefined),
      listFolder: vi.fn(),
    },
    cache: {
      put: vi.fn(),
      has: vi.fn(),
      url: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { ...base, ...overrides } as unknown as Platform;
}

describe('listTrashedItems', () => {
  it('queries only deleted items, newest-deleted first', async () => {
    const platform = makePlatform();
    await listTrashedItems(platform);
    const calls = vi.mocked(platform.db.select).mock.calls;
    expect(calls[0][0]).toContain('deleted_at IS NOT NULL');
    expect(calls[0][0]).toContain('ORDER BY deleted_at DESC');
  });
});

describe('deleteForever', () => {
  it('purges the original files, the cached derivatives, and the DB rows', async () => {
    const platform = makePlatform({
      db: {
        ...makePlatform().db,
        select: vi.fn().mockResolvedValue([{ id: 'a', file_path: 'media/2026/01/a.jpg' }]),
      },
    });

    await deleteForever(platform, ['a']);

    expect(platform.media.purge).toHaveBeenCalledWith(['media/2026/01/a.jpg']);
    expect(platform.cache.delete).toHaveBeenCalledWith(['t128/a', 't512/a']);
    const batchCalls = vi.mocked(platform.db.batch).mock.calls;
    expect(batchCalls).toHaveLength(1);
    const statements = batchCalls[0][0];
    expect(statements.some((s) => s.sql.includes('DELETE FROM placements'))).toBe(true);
    expect(statements.some((s) => s.sql.includes('DELETE FROM items'))).toBe(true);
  });

  it('does nothing for an empty id list', async () => {
    const platform = makePlatform();
    await deleteForever(platform, []);
    expect(platform.media.purge).not.toHaveBeenCalled();
    expect(platform.db.batch).not.toHaveBeenCalled();
  });

  it('skips items with no file_path without failing', async () => {
    const platform = makePlatform({
      db: {
        ...makePlatform().db,
        select: vi.fn().mockResolvedValue([{ id: 'a', file_path: null }]),
      },
    });

    await deleteForever(platform, ['a']);
    expect(platform.media.purge).not.toHaveBeenCalled();
  });
});

describe('purgeExpiredTrash', () => {
  it('does nothing when nothing is older than 30 days', async () => {
    const platform = makePlatform();
    await purgeExpiredTrash(platform);
    expect(platform.db.batch).not.toHaveBeenCalled();
  });

  it('deletes forever anything trashed more than 30 days ago', async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'old-1' }]) // the cutoff query
      .mockResolvedValueOnce([]); // deleteForever's own file_path lookup
    const platform = makePlatform({ db: { ...makePlatform().db, select } });

    await purgeExpiredTrash(platform);

    const [sql, params] = select.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('deleted_at < ?');
    expect(params).toHaveLength(1);
    expect(platform.db.batch).toHaveBeenCalled();
  });
});
