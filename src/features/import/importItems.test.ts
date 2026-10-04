import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFontFilesStore } from '@/state/fontFilesStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { useImportStore } from '@/state/importStore';
import { useToastStore } from '@/state/toastStore';
import { useHistoryStore } from '@/commands/history';
import type { DbRow, DbStatement, Platform } from '@/platform/types';

const enqueueImage = vi.fn();
const enqueueVideo = vi.fn();
const enqueuePdf = vi.fn();
const enqueueFont = vi.fn();
vi.mock('@/workers/ingestQueue', () => ({
  getIngestQueue: () => ({ enqueue: enqueueImage }),
}));
vi.mock('@/workers/videoIngestQueue', () => ({
  getVideoIngestQueue: () => ({ enqueue: enqueueVideo }),
}));
vi.mock('@/workers/pdfIngestQueue', () => ({
  getPdfIngestQueue: () => ({ enqueue: enqueuePdf }),
}));
vi.mock('@/workers/fontIngestQueue', () => ({
  getFontIngestQueue: () => ({ enqueue: enqueueFont }),
}));

// Imported after the mocks above so `importItems.ts` picks up the mocked ingest queues.
const { freeCentreFor, importFiles, importPaths } = await import('./importItems');

function makeFile(name: string, content = 'x', type = 'image/png'): File {
  return new File([content], name, { type });
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
  useBoardStore.setState({ boards: new Map(), currentBoardId: null });
  useImportStore.setState({ active: false, total: 0, done: 0, cancelRequested: false });
  useToastStore.setState({ toasts: [] });
  useHistoryStore.setState({ past: [], future: [] });
  enqueueImage.mockClear();
  enqueueVideo.mockClear();
  enqueuePdf.mockClear();
  enqueueFont.mockClear();
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

  it('routes a video file to the video ingest queue, with kind set to video', async () => {
    const platform = makePlatform({
      media: {
        ...makePlatform().media,
        importFile: vi.fn().mockResolvedValue({
          relPath: 'media/2026/01/clip-a.mp4',
          hash: 'hash-clip',
          size: 50,
          mime: 'video/mp4',
        }),
      },
    });
    await importFiles(platform, [makeFile('clip.mp4', 'x', 'video/mp4')], { x: 0, y: 0 });

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('video');
    expect(enqueueVideo).toHaveBeenCalledWith([
      { itemId: items[0].id, relPath: 'media/2026/01/clip-a.mp4', mime: 'video/mp4' },
    ]);
    expect(enqueueImage).not.toHaveBeenCalled();
  });

  it('routes a PDF file to the pdf ingest queue, with kind set to pdf', async () => {
    const platform = makePlatform({
      media: {
        ...makePlatform().media,
        importFile: vi.fn().mockResolvedValue({
          relPath: 'media/2026/01/doc-a.pdf',
          hash: 'hash-doc',
          size: 80,
          mime: 'application/pdf',
        }),
      },
    });
    await importFiles(platform, [makeFile('doc.pdf', 'x', 'application/pdf')], { x: 0, y: 0 });

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('pdf');
    expect(enqueuePdf).toHaveBeenCalledWith([
      { itemId: items[0].id, relPath: 'media/2026/01/doc-a.pdf' },
    ]);
    expect(enqueueImage).not.toHaveBeenCalled();
    expect(enqueueVideo).not.toHaveBeenCalled();
  });

  it('routes a font file to the font ingest queue, with kind set to font', async () => {
    const platform = makePlatform({
      media: {
        ...makePlatform().media,
        importFile: vi.fn().mockResolvedValue({
          relPath: 'media/2026/01/face-a.woff2',
          hash: 'hash-face',
          size: 40,
          mime: 'font/woff2',
        }),
      },
    });
    await importFiles(platform, [makeFile('face.woff2', 'x', 'font/woff2')], { x: 0, y: 0 });

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('font');
    expect(enqueueFont).toHaveBeenCalledWith([{ itemId: items[0].id }]);
    // An unreadable font still gets a card (the queue marks it unsupported) and one file row.
    expect(useFontFilesStore.getState().files.get(items[0].id)).toHaveLength(1);
    expect(enqueueImage).not.toHaveBeenCalled();
    expect(enqueuePdf).not.toHaveBeenCalled();
  });

  it('also lands on the Library map when dropped while a board is open (§2.3)', async () => {
    useBoardStore.setState({ currentBoardId: 'board-1' });
    const platform = makePlatform();
    await importFiles(platform, [makeFile('sunset.png')], { x: 500, y: 500 });

    // The live store (scoped to the currently open space) only shows the board's own placement.
    const placements = [...useLibraryStore.getState().placements.values()];
    expect(placements).toHaveLength(1);
    // findFreeSpot centers the placeholder on the drop point, not its top-left corner.
    expect(placements[0]).toMatchObject({ boardId: 'board-1', x: 340, y: 340 });

    // A second, DB-only placement row was written for the Library board too.
    const batchCall = (platform.db.batch as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DbStatement[];
    const placementInserts = batchCall.filter((s) => s.sql.includes('INSERT INTO placements'));
    expect(placementInserts).toHaveLength(2);
    expect(placementInserts[0].params?.[0]).toBe('board-1');
    expect(placementInserts[1].params?.[0]).toBe('lib-board');
  });

  it('does not duplicate onto the Library map while the Library map itself is open', async () => {
    useBoardStore.setState({ currentBoardId: 'lib-board' });
    const platform = makePlatform();
    await importFiles(platform, [makeFile('sunset.png')], { x: 0, y: 0 });

    const batchCall = (platform.db.batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      sql: string;
    }[];
    expect(batchCall.filter((s) => s.sql.includes('INSERT INTO placements'))).toHaveLength(1);
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

describe('freeCentreFor', () => {
  it('returns the viewport centre when the spot is free, and moves aside when it is taken', () => {
    useLibraryStore.setState({ placements: new Map() });
    expect(freeCentreFor({ x: 500, y: 400 }, { w: 200, h: 200 })).toEqual({ x: 500, y: 400 });

    useLibraryStore.setState({
      placements: new Map([
        [
          'a',
          {
            boardId: 'lib',
            itemId: 'a',
            x: 400,
            y: 300,
            w: 200,
            h: 200,
            z: 0,
            frameId: null,
            cropX: null,
            cropY: null,
            parentId: null,
            addedAt: '',
          },
        ],
      ]),
    });
    const next = freeCentreFor({ x: 500, y: 400 }, { w: 200, h: 200 });
    expect(next).not.toEqual({ x: 500, y: 400 });
    const overlaps = Math.abs(next.x - 500) < 200 && Math.abs(next.y - 400) < 200; // two 200-wide boxes
    expect(overlaps).toBe(false);
  });
});
