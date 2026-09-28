import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiQueue, CLIP_MODEL, type WorkerLike } from './aiQueue';
import { useSettingsStore } from '@/state/settingsStore';
import type { Platform } from '@/platform/types';
import type { AiWorkerResponse } from './ai.worker';

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

  respond(data: AiWorkerResponse): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  const base: Partial<Platform> = {
    kind: 'browser',
    cache: {
      put: vi.fn().mockResolvedValue(undefined),
      has: vi.fn(),
      url: (key: string) => `media://cache/${key}`,
      delete: vi.fn(),
    },
    embeddings: {
      put: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(new Map()),
    },
  };
  return { ...base, ...overrides } as Platform;
}

beforeEach(() => {
  useSettingsStore.setState({ offlineMode: false, aiEnabled: true });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('AiQueue', () => {
  it('sends a configure message before any embed request', async () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    new AiQueue(platform, () => (worker = new FakeWorker()));
    await flush();

    expect(worker?.posted[0]).toMatchObject({ type: 'configure' });
  });

  it('processes one item at a time, queuing the rest', async () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));

    queue.enqueue([
      { itemId: 'a', cacheKey: 't512/a' },
      { itemId: 'b', cacheKey: 't512/b' },
    ]);
    await flush();

    // [0] is 'configure', [1] is the first embedImage request.
    expect(worker?.posted).toHaveLength(2);
    expect(queue.pending).toBe(2); // 'a' in flight + 'b' still queued
  });

  it('persists a successful embedding and moves to the next item', async () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));

    queue.enqueue([
      { itemId: 'a', cacheKey: 't512/a' },
      { itemId: 'b', cacheKey: 't512/b' },
    ]);
    await flush();

    const vector = new Float32Array(512).fill(0.5).buffer;
    worker?.respond({ type: 'embedResult', id: 'req-1', itemId: 'a', ok: true, vector });
    await flush();

    expect(platform.embeddings.put).toHaveBeenCalledWith(
      CLIP_MODEL,
      expect.arrayContaining([['a', expect.any(Float32Array)]]),
    );
    expect(queue.completed).toBe(1);
    expect(worker?.posted).toHaveLength(3); // configure + a + b
  });

  it('counts a failed embedding without persisting, and still moves on', async () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));

    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    worker?.respond({ type: 'embedResult', id: 'req-1', itemId: 'a', ok: false, error: 'boom' });
    await flush();

    expect(platform.embeddings.put).not.toHaveBeenCalled();
    expect(queue.failed).toBe(1);
  });

  it('pause() stops dispatch, resume() picks back up', async () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));
    queue.pause();

    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    expect(worker?.posted).toHaveLength(1); // only 'configure' — dispatch was paused

    queue.resume();
    await flush();
    expect(worker?.posted).toHaveLength(2);
  });

  it('destroy() terminates the worker', () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));
    queue.destroy();
    expect(worker?.terminated).toBe(true);
  });
});
