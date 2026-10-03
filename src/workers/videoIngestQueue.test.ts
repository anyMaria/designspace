import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { VideoDerivatives } from '@/lib/videoFrame';

const extractVideoDerivatives =
  vi.fn<(bytes: ArrayBuffer, mime: string) => Promise<VideoDerivatives>>();
vi.mock('@/lib/videoFrame', () => ({
  extractVideoDerivatives: (bytes: ArrayBuffer, mime: string) =>
    extractVideoDerivatives(bytes, mime),
}));

// Imported after the mock above so the module picks it up.
const { VideoIngestQueue } = await import('./videoIngestQueue');

function makePlatform(): Platform {
  return {
    media: {
      originalUrl: (relPath: string) => `media://original/${relPath}`,
      importPaths: vi.fn(),
      importFile: vi.fn(),
      importBytes: vi.fn(),
      importUrl: vi.fn(),
      reveal: vi.fn(),
      purge: vi.fn(),
      listFolder: vi.fn(),
    },
    db: {
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue({ changes: 1 }),
      batch: vi.fn().mockResolvedValue(undefined),
    },
    cache: {
      put: vi.fn().mockResolvedValue(undefined),
      has: vi.fn(),
      url: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as Platform;
}

function makeDerivatives(overrides: Partial<VideoDerivatives> = {}): VideoDerivatives {
  return {
    width: 1920,
    height: 1080,
    durationMs: 12_345,
    posterMs: 1_234,
    t128: new ArrayBuffer(4),
    t512: new ArrayBuffer(4),
    palette: [{ hex: '#e9a845', weight: 1 }],
    colorFamilies: ['orange'],
    ...overrides,
  };
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  extractVideoDerivatives.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

describe('VideoIngestQueue', () => {
  it('persists derived thumbnails, duration and palette, and marks the item ok', async () => {
    extractVideoDerivatives.mockResolvedValue(makeDerivatives());
    const platform = makePlatform();
    const queue = new VideoIngestQueue(platform);

    queue.enqueue([{ itemId: 'v1', relPath: 'media/v1.mp4', mime: 'video/mp4' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).toHaveBeenCalledWith('t128/v1', expect.any(Uint8Array));
    expect(platform.cache.put).toHaveBeenCalledWith('t512/v1', expect.any(Uint8Array));
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ok'"),
      expect.arrayContaining([1920, 1080, 12_345, 1_234]),
    );
    expect(queue.pending).toBe(0);
  });

  it('marks an unplayable video as unsupported rather than retrying', async () => {
    extractVideoDerivatives.mockRejectedValue(new Error('unsupported video codec or container'));
    const platform = makePlatform();
    useLibraryStore.setState({
      items: new Map([
        [
          'v1',
          {
            id: 'v1',
            kind: 'video',
            title: 'Clip',
            filePath: 'media/v1.mov',
            fileName: 'v1.mov',
            fileHash: null,
            fileSize: null,
            mime: 'video/quicktime',
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
          },
        ],
      ]),
    });
    const queue = new VideoIngestQueue(platform);

    queue.enqueue([{ itemId: 'v1', relPath: 'media/v1.mov', mime: 'video/quicktime' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).not.toHaveBeenCalled();
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'unsupported'"),
      expect.any(Array),
    );
    expect(useLibraryStore.getState().items.get('v1')?.status).toBe('unsupported');
  });

  it('processes queued items one at a time, in order', async () => {
    const order: string[] = [];
    extractVideoDerivatives.mockImplementation(() => {
      order.push('processing');
      return Promise.resolve(makeDerivatives());
    });
    const platform = makePlatform();
    const queue = new VideoIngestQueue(platform);

    queue.enqueue([
      { itemId: 'a', relPath: 'media/a.mp4', mime: 'video/mp4' },
      { itemId: 'b', relPath: 'media/b.mp4', mime: 'video/mp4' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['processing', 'processing']);
    expect(queue.pending).toBe(0);
  });

  it('marks the item unsupported when the original cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, url: 'media://x' }));
    const platform = makePlatform();
    const queue = new VideoIngestQueue(platform);

    queue.enqueue([{ itemId: 'v1', relPath: 'media/v1.bin', mime: 'video/mp4' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'unsupported'"),
      [expect.any(String), 'v1'],
    );
  });
});
