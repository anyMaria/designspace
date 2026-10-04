import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestQueue, resumePendingIngest, type WorkerLike } from './ingestQueue';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { IngestResponse } from './ingest.worker';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Test helper: simulate the worker responding. */
  respond(data: IngestResponse): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  const base: Partial<Platform> = {
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
      pruneOrphans: vi.fn().mockResolvedValue(0),
    },
  };
  return { ...base, ...overrides } as Platform;
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }),
  );
});

describe('IngestQueue', () => {
  it('dispatches queued items to idle workers up to the pool size', async () => {
    const workers: FakeWorker[] = [];
    const platform = makePlatform();
    const queue = new IngestQueue(
      platform,
      () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      2,
    );

    queue.enqueue([
      { itemId: 'a', relPath: 'media/a.jpg', mime: 'image/jpeg' },
      { itemId: 'b', relPath: 'media/b.jpg', mime: 'image/jpeg' },
      { itemId: 'c', relPath: 'media/c.jpg', mime: 'image/jpeg' },
    ]);

    // Let the async dispatch (fetch) resolve.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(workers).toHaveLength(2);
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[1].posted).toHaveLength(1);
    expect(queue.pending).toBe(1); // 'c' still waiting for a free worker
  });

  it('picks up the next queued item once a worker finishes', async () => {
    const workers: FakeWorker[] = [];
    const platform = makePlatform();
    const queue = new IngestQueue(
      platform,
      () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      1,
    );

    queue.enqueue([
      { itemId: 'a', relPath: 'media/a.jpg', mime: 'image/jpeg' },
      { itemId: 'b', relPath: 'media/b.jpg', mime: 'image/jpeg' },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(workers[0].posted).toHaveLength(1);
    expect(queue.pending).toBe(1);

    workers[0].respond({
      id: 'req-1',
      itemId: 'a',
      ok: true,
      width: 100,
      height: 100,
      t128: new ArrayBuffer(4),
      t512: new ArrayBuffer(4),
      palette: [],
      colorFamilies: [],
      phash: '0'.repeat(16),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queue.pending).toBe(0);
    expect(workers[0].posted).toHaveLength(2);
  });

  it('persist() writes derived data and marks the item ok', async () => {
    const platform = makePlatform();
    const queue = new IngestQueue(platform, () => new FakeWorker(), 1);

    await queue.persist({
      id: 'req-1',
      itemId: 'item1',
      ok: true,
      width: 200,
      height: 150,
      t128: new ArrayBuffer(4),
      t512: new ArrayBuffer(4),
      palette: [{ hex: '#e9a845', weight: 1 }],
      colorFamilies: ['orange'],
      phash: 'a'.repeat(16),
    });

    expect(platform.cache.put).toHaveBeenCalledWith('t128/item1', expect.any(Uint8Array));
    expect(platform.cache.put).toHaveBeenCalledWith('t512/item1', expect.any(Uint8Array));
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ok'"),
      expect.any(Array),
    );
  });

  it('persist() marks a failed ingest as status=error without touching the cache', async () => {
    const platform = makePlatform();
    const queue = new IngestQueue(platform, () => new FakeWorker(), 1);

    await queue.persist({ id: 'req-1', itemId: 'item1', ok: false, error: 'decode failed' });

    expect(platform.cache.put).not.toHaveBeenCalled();
    expect(platform.db.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'error'"), [
      expect.any(String),
      'item1',
    ]);
  });

  it('destroy() terminates every worker', () => {
    const workers: FakeWorker[] = [];
    const platform = makePlatform();
    const queue = new IngestQueue(
      platform,
      () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      2,
    );
    queue.destroy();
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('marks the item failed when the original cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, url: 'media://x' }));
    const platform = makePlatform();
    const queue = new IngestQueue(platform, () => new FakeWorker(), 1);

    queue.enqueue([{ itemId: 'a', relPath: 'media/a.jpg', mime: 'image/jpeg' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(platform.db.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'error'"), [
      expect.any(String),
      'a',
    ]);
  });
});

describe('resumePendingIngest', () => {
  it('re-queues a failed link by its cover path (links share the image worker)', async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          const w = new FakeWorker();
          workers.push(w);
          return w;
        }
      },
    );
    const select = vi
      .fn()
      .mockResolvedValue([{ id: 'l1', file_path: 'media/2026/10/cover.jpg', mime: 'image/jpeg' }]);
    const platform = makePlatform({ db: { select } as unknown as Platform['db'] });

    const queued = await resumePendingIngest(platform);

    expect(queued).toBe(1);
    const sql = select.mock.calls[0]?.[0] as string;
    expect(sql).toContain("kind = 'link' AND cover_path IS NOT NULL");
    expect(sql).toContain('COALESCE(file_path, cover_path)');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(workers.flatMap((w) => w.posted)).toHaveLength(1);
  });
});
