import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/state/libraryStore';
import { useImportStore } from '@/state/importStore';
import { useToastStore } from '@/state/toastStore';
import { useHistoryStore } from '@/commands/history';
import type { DbRow, Platform } from '@/platform/types';

vi.mock('@/workers/ingestQueue', () => ({
  getIngestQueue: () => ({ enqueue: vi.fn() }),
}));

// Imported after the mock above so `importItems.ts` picks up the mocked ingest queue.
const { importFiles, importPaths } = await import('./importItems');

function makeFile(name: string, content = 'x'): File {
  return new File([content], name, { type: 'image/png' });
}

function selectReturningDuplicate(row: {
  id: string;
  deleted_at: string | null;
}): Platform['db']['select'] {
  return <T extends DbRow = DbRow>(sql: string) =>
    Promise.resolve(sql.includes('file_hash') ? [row as unknown as T] : []);
}

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  const base = {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
    media: {
      importPaths: vi.fn(),
      importFile: vi.fn().mockResolvedValue({
        relPath: 'media/2026/01/x-a.png',
        hash: 'hash-a',
        size: 3,
        mime: 'image/png',
      }),
      importBytes: vi.fn(),
      importUrl: vi.fn(),
      originalUrl: vi.fn(),
      reveal: vi.fn(),
      purge: vi.fn(),
      listFolder: vi.fn(),
    },
  };
  return { ...base, ...overrides } as unknown as Platform;
}

beforeEach(() => {
  useLibraryStore.setState({
    libraryBoardId: 'lib-board',
    items: new Map(),
    placements: new Map(),
    selection: new Set(),
  });
  useImportStore.setState({ active: false, total: 0, done: 0, cancelRequested: false });
  useToastStore.setState({ toasts: [] });
  useHistoryStore.setState({ past: [], future: [] });
});

describe('importFiles', () => {
  it('shows an unsupported-file toast and skips files Designspace cannot ingest yet', async () => {
    const platform = makePlatform();
    await importFiles(platform, [makeFile('notes.txt')], { x: 0, y: 0 });

    expect(platform.media.importFile).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.message).toBe(
      "Designspace can't add .txt files yet.",
    );
  });

  it('creates an item and placement, selects it, and enqueues one undo step', async () => {
    const platform = makePlatform();
    await importFiles(platform, [makeFile('sunset.png')], { x: 100, y: 200 });

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'image', status: 'pending', fileHash: 'hash-a' });

    const placements = [...useLibraryStore.getState().placements.values()];
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ w: 320, h: 320 });

    expect(useLibraryStore.getState().selection.has(items[0].id)).toBe(true);
    expect(useHistoryStore.getState().past).toHaveLength(1);
    expect(useHistoryStore.getState().past[0].label).toBe('Add item');
  });

  it("doesn't copy the file again for a known duplicate, and offers Show", async () => {
    const platform = makePlatform({
      db: {
        ...makePlatform().db,
        select: selectReturningDuplicate({ id: 'existing-1', deleted_at: null }),
      },
    });

    await importFiles(platform, [makeFile('dup.png')], { x: 0, y: 0 });

    expect(platform.media.importFile).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().items.size).toBe(0);
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.message).toBe('Already in your library');
    expect(toast?.actionLabel).toBe('Show');
  });

  it('offers Restore for a duplicate that is in the Trash', async () => {
    const platform = makePlatform({
      db: {
        ...makePlatform().db,
        select: selectReturningDuplicate({
          id: 'trashed-1',
          deleted_at: '2026-01-01T00:00:00.000Z',
        }),
      },
    });

    await importFiles(platform, [makeFile('dup.png')], { x: 0, y: 0 });

    const toast = useToastStore.getState().toasts[0];
    expect(toast?.actionLabel).toBe('Restore');
  });

  it('places several files as a grid without any pair overlapping', async () => {
    const platform = makePlatform();
    await importFiles(platform, [makeFile('a.png'), makeFile('b.png'), makeFile('c.png')], {
      x: 0,
      y: 0,
    });

    const rects = [...useLibraryStore.getState().placements.values()];
    expect(rects).toHaveLength(3);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe('importPaths', () => {
  it('creates items from Rust-side results and skips ones already marked as duplicates', async () => {
    const platform = makePlatform({
      media: {
        ...makePlatform().media,
        importPaths: vi.fn().mockResolvedValue([
          { relPath: 'media/2026/01/x-a.jpg', hash: 'hash-a', size: 10, mime: 'image/jpeg' },
          {
            relPath: 'media/2026/01/x-b.jpg',
            hash: 'hash-b',
            size: 10,
            mime: 'image/jpeg',
            duplicateOf: 'existing-2',
          },
        ]),
      },
    });

    await importPaths(platform, ['/tmp/a.jpg', '/tmp/b.jpg'], { x: 0, y: 0 });

    expect(useLibraryStore.getState().items.size).toBe(1);
    expect(useHistoryStore.getState().past[0]?.label).toBe('Add item');
  });
});
