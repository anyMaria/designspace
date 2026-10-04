import { describe, expect, it, vi } from 'vitest';
import { daysUntilPurge, deleteForever, listTrashedItems, purgeExpiredTrash } from './trashActions';
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
    expect(platform.cache.delete).toHaveBeenCalledWith(['t128/a', 't512/a', 'trow/a']);
    const batchCalls = vi.mocked(platform.db.batch).mock.calls;
    expect(batchCalls).toHaveLength(1);
    const statements = batchCalls[0][0];
    expect(statements.some((s) => s.sql.includes('DELETE FROM placements'))).toBe(true);
    expect(statements.some((s) => s.sql.includes('DELETE FROM items'))).toBe(true);
  });

  it('purges every file of a font family (Patch 2 · F3)', async () => {
    const platform = makePlatform({
      db: {
        ...makePlatform().db,
        select: vi
          .fn()
          .mockImplementation((sql: string) =>
            Promise.resolve(
              sql.includes('font_files')
                ? [{ file_path: 'media/f-regular.ttf' }, { file_path: 'media/f-italic.ttf' }]
                : [{ id: 'fam', file_path: 'media/f-regular.ttf' }],
            ),
          ),
      },
    });
    await deleteForever(platform, ['fam']);
    expect(platform.media.purge).toHaveBeenCalledWith([
      'media/f-regular.ttf',
      'media/f-italic.ttf',
    ]);
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
      .mockResolvedValueOnce([]) // deleteForever's own file_path lookup
      .mockResolvedValueOnce([]); // and its font_files lookup
    const platform = makePlatform({ db: { ...makePlatform().db, select } });

    await purgeExpiredTrash(platform);

    const [sql, params] = select.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('deleted_at < ?');
    expect(params).toHaveLength(1);
    expect(platform.db.batch).toHaveBeenCalled();
  });
});

describe('daysUntilPurge', () => {
  it('returns 30 for an item deleted just now', () => {
    expect(daysUntilPurge(new Date().toISOString())).toBe(30);
  });

  it('returns 0 (never negative) for an item already past its purge date', () => {
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilPurge(longAgo)).toBe(0);
  });

  it('counts down as the deletion date recedes', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysUntilPurge(tenDaysAgo)).toBe(20);
  });
});
