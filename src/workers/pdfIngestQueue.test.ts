import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { PdfDerivatives } from '@/lib/pdfRender';

const extractPdfDerivatives =
  vi.fn<(bytes: ArrayBuffer, coverPage?: number) => Promise<PdfDerivatives>>();
vi.mock('@/lib/pdfRender', () => ({
  extractPdfDerivatives: (bytes: ArrayBuffer, coverPage?: number) =>
    extractPdfDerivatives(bytes, coverPage),
}));

// Imported after the mock above so the module picks it up.
const { PdfIngestQueue, setPdfCoverPage } = await import('./pdfIngestQueue');

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

function makeDerivatives(overrides: Partial<PdfDerivatives> = {}): PdfDerivatives {
  return {
    pageCount: 5,
    coverPage: 1,
    width: 612,
    height: 792,
    t128: new ArrayBuffer(4),
    t512: new ArrayBuffer(4),
    palette: [{ hex: '#e9a845', weight: 1 }],
    colorFamilies: ['orange'],
    ...overrides,
  };
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  extractPdfDerivatives.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

describe('PdfIngestQueue', () => {
  it('persists derived thumbnails, page count and palette, and marks the item ok', async () => {
    extractPdfDerivatives.mockResolvedValue(makeDerivatives());
    const platform = makePlatform();
    const queue = new PdfIngestQueue(platform);

    queue.enqueue([{ itemId: 'p1', relPath: 'media/p1.pdf' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).toHaveBeenCalledWith('t128/p1', expect.any(Uint8Array));
    expect(platform.cache.put).toHaveBeenCalledWith('t512/p1', expect.any(Uint8Array));
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ok'"),
      expect.arrayContaining([612, 792, 5, 1]),
    );
    expect(queue.pending).toBe(0);
  });

  it('marks an unparseable PDF as unsupported rather than retrying', async () => {
    extractPdfDerivatives.mockRejectedValue(new Error('invalid PDF structure'));
    const platform = makePlatform();
    useLibraryStore.setState({
      items: new Map([
        [
          'p1',
          {
            id: 'p1',
            kind: 'pdf',
            title: 'Doc',
            filePath: 'media/p1.pdf',
            fileName: 'p1.pdf',
            fileHash: null,
            fileSize: null,
            mime: 'application/pdf',
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
    const queue = new PdfIngestQueue(platform);

    queue.enqueue([{ itemId: 'p1', relPath: 'media/p1.pdf' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.cache.put).not.toHaveBeenCalled();
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'unsupported'"),
      expect.any(Array),
    );
    expect(useLibraryStore.getState().items.get('p1')?.status).toBe('unsupported');
  });

  it('processes queued items one at a time, in order', async () => {
    const order: string[] = [];
    extractPdfDerivatives.mockImplementation(() => {
      order.push('processing');
      return Promise.resolve(makeDerivatives());
    });
    const platform = makePlatform();
    const queue = new PdfIngestQueue(platform);

    queue.enqueue([
      { itemId: 'a', relPath: 'media/a.pdf' },
      { itemId: 'b', relPath: 'media/b.pdf' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(['processing', 'processing']);
    expect(queue.pending).toBe(0);
  });
});

describe('setPdfCoverPage', () => {
  it('re-derives thumbnails for the chosen page and persists it as the new cover', async () => {
    extractPdfDerivatives.mockResolvedValue(makeDerivatives({ coverPage: 3 }));
    const platform = makePlatform();

    await setPdfCoverPage(platform, 'p1', 'media/p1.pdf', 3);

    expect(extractPdfDerivatives).toHaveBeenCalledWith(expect.any(ArrayBuffer), 3);
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ok'"),
      expect.arrayContaining([3]),
    );
  });
});
