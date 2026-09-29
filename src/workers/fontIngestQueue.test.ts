import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { FontDerivatives } from '@/lib/fontRender';

const extractFontDerivatives =
  vi.fn<(bytes: ArrayBuffer, localFamily: string) => Promise<FontDerivatives>>();
vi.mock('@/lib/fontRender', () => ({
  extractFontDerivatives: (bytes: ArrayBuffer, localFamily: string) =>
    extractFontDerivatives(bytes, localFamily),
}));

// Imported after the mock above so the module picks it up.
const { FontIngestQueue } = await import('./fontIngestQueue');

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

function makeDerivatives(overrides: Partial<FontDerivatives> = {}): FontDerivatives {
  return {
    family: 'Test Sans',
    subfamily: 'Regular',
    fullName: 'Test Sans Regular',
    designer: 'Jane Doe',
    manufacturer: 'Test Foundry',
    license: 'OFL',
    glyphCount: 230,
    variableAxes: [],
    t128: new ArrayBuffer(4),
    t512: new ArrayBuffer(4),
    ...overrides,
  };
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  extractFontDerivatives.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

describe('FontIngestQueue', () => {
  it('persists derived thumbnails and metadata, and marks the item ok', async () => {
    extractFontDerivatives.mockResolvedValue(makeDerivatives());
    const platform = makePlatform();
    const queue = new FontIngestQueue(platform);

    queue.enqueue([{ itemId: 'f1', relPath: 'media/f1.woff2' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).toHaveBeenCalledWith('t128/f1', expect.any(Uint8Array));
    expect(platform.cache.put).toHaveBeenCalledWith('t512/f1', expect.any(Uint8Array));
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ok'"),
      expect.arrayContaining([expect.stringContaining('Test Sans')]),
    );
    expect(queue.pending).toBe(0);
  });

  it('marks an unparseable font as unsupported rather than retrying', async () => {
    extractFontDerivatives.mockRejectedValue(new Error('unknown font format'));
    const platform = makePlatform();
    useLibraryStore.setState({
      items: new Map([
        [
          'f1',
          {
            id: 'f1',
            kind: 'font',
            title: 'Bad',
            filePath: 'media/f1.ttf',
            fileName: 'f1.ttf',
            fileHash: null,
            fileSize: null,
            mime: 'font/ttf',
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
    const queue = new FontIngestQueue(platform);

    queue.enqueue([{ itemId: 'f1', relPath: 'media/f1.ttf' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).not.toHaveBeenCalled();
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'unsupported'"),
      expect.any(Array),
    );
    expect(useLibraryStore.getState().items.get('f1')?.status).toBe('unsupported');
  });

  it('processes queued items one at a time, in order', async () => {
    const order: string[] = [];
    extractFontDerivatives.mockImplementation(() => {
      order.push('processing');
      return Promise.resolve(makeDerivatives());
    });
    const platform = makePlatform();
    const queue = new FontIngestQueue(platform);

    queue.enqueue([
      { itemId: 'a', relPath: 'media/a.ttf' },
      { itemId: 'b', relPath: 'media/b.ttf' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['processing', 'processing']);
    expect(queue.pending).toBe(0);
  });
});
