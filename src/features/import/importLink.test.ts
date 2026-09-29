import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { useImportStore } from '@/state/importStore';
import { useToastStore } from '@/state/toastStore';
import { useHistoryStore } from '@/commands/history';
import type { Platform } from '@/platform/types';

const enqueueImage = vi.fn();
vi.mock('@/workers/ingestQueue', () => ({
  getIngestQueue: () => ({ enqueue: enqueueImage }),
  CURRENT_DERIVED_V: 1,
}));

const { importLink, enrichLink } = await import('./importLink');

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  const base = {
    db: {
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ changes: 1 }),
      batch: vi.fn().mockResolvedValue(undefined),
    },
    media: {
      importPaths: vi.fn(),
      importFile: vi.fn(),
      importBytes: vi.fn(),
      importUrl: vi.fn().mockRejectedValue(new Error('not an image')),
      originalUrl: vi.fn(),
      reveal: vi.fn(),
      purge: vi.fn(),
      listFolder: vi.fn(),
    },
    net: {
      linkMeta: vi.fn(),
      enabled: () => true,
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
});

describe('importLink', () => {
  it('shows a toast and creates nothing for an invalid URL', async () => {
    const platform = makePlatform();
    await importLink(platform, 'not a url', { x: 0, y: 0 }, false);

    expect(useLibraryStore.getState().items.size).toBe(0);
    expect(useToastStore.getState().toasts[0]?.message).toBe("That doesn't look like a valid URL.");
  });

  it('creates a pending link item immediately, titled by domain', async () => {
    const platform = makePlatform();
    platform.net.linkMeta = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    await importLink(platform, 'https://example.com/article', { x: 0, y: 0 }, false);

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'link',
      title: 'example.com',
      url: 'https://example.com/article',
    });

    const placements = [...useLibraryStore.getState().placements.values()];
    expect(placements).toHaveLength(1);
    expect(useHistoryStore.getState().past[0]?.label).toBe('Add item');
  });

  it('marks the item ok with a domain card when Offline mode is on, without calling net', async () => {
    const platform = makePlatform();
    await importLink(platform, 'https://example.com', { x: 0, y: 0 }, true);

    expect(platform.net.linkMeta).not.toHaveBeenCalled();
    const item = [...useLibraryStore.getState().items.values()][0];
    expect(item.status).toBe('ok');
  });

  it('imports a direct image URL as an image item instead of a link', async () => {
    const platform = makePlatform({
      media: {
        ...makePlatform().media,
        importUrl: vi.fn().mockResolvedValue({
          relPath: 'media/2026/01/cover-a.jpg',
          hash: 'hash-a',
          size: 10,
          mime: 'image/jpeg',
        }),
      },
    });
    await importLink(platform, 'https://example.com/cover.jpg', { x: 0, y: 0 }, false);

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'image', sourceUrl: 'https://example.com/cover.jpg' });
    expect(platform.net.linkMeta).not.toHaveBeenCalled();
  });

  it('falls back to a link item when the URL looks like an image but download fails', async () => {
    const platform = makePlatform();
    platform.net.linkMeta = vi.fn().mockImplementation(() => new Promise(() => {}));
    await importLink(platform, 'https://example.com/cover.jpg', { x: 0, y: 0 }, false);

    const items = [...useLibraryStore.getState().items.values()];
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('link');
  });
});

describe('enrichLink', () => {
  function seedPendingLink(id: string, url: string): void {
    useLibraryStore.setState({
      items: new Map([
        [
          id,
          {
            id,
            kind: 'link',
            title: 'example.com',
            filePath: null,
            fileName: null,
            fileHash: null,
            fileSize: null,
            mime: null,
            width: null,
            height: null,
            artist: null,
            sourceUrl: null,
            why: null,
            palette: null,
            colorFamilies: null,
            phash: null,
            favorite: false,
            sortedAt: null,
            viewedAt: null,
            status: 'pending',
            derivedV: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
            url,
            coverPath: null,
            linkMeta: null,
          },
        ],
      ]),
    });
  }

  it('fetches metadata, downloads the cover and enqueues it for image derivation', async () => {
    const platform = makePlatform();
    platform.net.linkMeta = vi.fn().mockResolvedValue({
      finalUrl: 'https://example.com/article',
      title: 'A Great Article',
      description: 'Stuff',
      siteName: 'Example',
      imageUrl: 'https://example.com/cover.png',
      faviconUrl: null,
    });
    platform.media.importUrl = vi.fn().mockResolvedValue({
      relPath: 'media/2026/01/cover-x.png',
      hash: 'hash-x',
      size: 5,
      mime: 'image/png',
    });
    seedPendingLink('link1', 'https://example.com/article');

    await enrichLink(platform, 'link1', 'https://example.com/article');

    const item = useLibraryStore.getState().items.get('link1');
    expect(item?.title).toBe('A Great Article');
    expect(item?.coverPath).toBe('media/2026/01/cover-x.png');
    expect(item?.status).toBe('pending'); // flips to 'ok' once the enqueued image ingest finishes
    expect(enqueueImage).toHaveBeenCalledWith([
      { itemId: 'link1', relPath: 'media/2026/01/cover-x.png', mime: 'image/png' },
    ]);
  });

  it('marks the item ok with a domain card when there is no og:image', async () => {
    const platform = makePlatform();
    platform.net.linkMeta = vi.fn().mockResolvedValue({
      finalUrl: 'https://example.com',
      title: 'Example',
      description: null,
      siteName: 'Example',
      imageUrl: null,
      faviconUrl: null,
    });
    seedPendingLink('link1', 'https://example.com');

    await enrichLink(platform, 'link1', 'https://example.com');

    const item = useLibraryStore.getState().items.get('link1');
    expect(item?.status).toBe('ok');
    expect(enqueueImage).not.toHaveBeenCalled();
  });

  it('marks the item ok with a domain card when the fetch fails entirely', async () => {
    const platform = makePlatform();
    platform.net.linkMeta = vi.fn().mockRejectedValue(new Error('offline'));
    seedPendingLink('link1', 'https://example.com');

    await enrichLink(platform, 'link1', 'https://example.com');

    const item = useLibraryStore.getState().items.get('link1');
    expect(item?.status).toBe('ok');
  });
});
