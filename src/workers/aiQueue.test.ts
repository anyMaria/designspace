import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiQueue, CLIP_MODEL, type WorkerLike } from './aiQueue';
import { useSettingsStore } from '@/state/settingsStore';
import { useAiStatusStore } from '@/state/aiStatusStore';
import type { Platform } from '@/platform/types';
import type { AiWorkerResponse } from './ai.worker';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
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
      pruneOrphans: vi.fn().mockResolvedValue(0),
    },
    embeddings: {
      put: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(new Map()),
    },
  };
  return { ...base, ...overrides } as Platform;
}

beforeEach(() => {
  useAiStatusStore.setState({ status: 'off', error: null, provider: null });
  useSettingsStore.setState({ offlineMode: false, aiEnabled: true });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

/** A queue whose worker has answered `ready`; `posted` then holds only what happens afterwards. */
async function readyQueue(platform = makePlatform()) {
  let worker!: FakeWorker;
  const queue = new AiQueue(platform, () => (worker = new FakeWorker()));
  await flush();
  worker.respond({ type: 'ready', provider: 'fake' });
  worker.posted = [];
  return { worker, queue, platform };
}

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
    const { worker, queue } = await readyQueue();

    queue.enqueue([
      { itemId: 'a', cacheKey: 't512/a' },
      { itemId: 'b', cacheKey: 't512/b' },
    ]);
    await flush();

    expect(worker.posted).toHaveLength(1);
    expect(queue.pending).toBe(2); // 'a' in flight + 'b' still queued
  });

  it('persists a successful embedding and moves to the next item', async () => {
    const { worker, queue, platform } = await readyQueue();

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
    expect(worker.posted).toHaveLength(2); // a + b
  });

  it('counts a failed embedding without persisting, and still moves on', async () => {
    const { worker, queue, platform } = await readyQueue();

    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    worker?.respond({ type: 'embedResult', id: 'req-1', itemId: 'a', ok: false, error: 'boom' });
    await flush();

    expect(platform.embeddings.put).not.toHaveBeenCalled();
    expect(queue.failed).toBe(1);
  });

  it('pause() stops dispatch, resume() picks back up, and isPaused tracks it', async () => {
    const { worker, queue } = await readyQueue();
    expect(queue.isPaused).toBe(false);
    queue.pause();
    expect(queue.isPaused).toBe(true);

    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    expect(worker.posted).toHaveLength(0); // dispatch was paused

    queue.resume();
    expect(queue.isPaused).toBe(false);
    await flush();
    expect(worker.posted).toHaveLength(1);
  });

  it('embedText() resolves with the returned vector without touching the analysis queue', async () => {
    const { worker, queue } = await readyQueue();

    const promise = queue.embedText('a golden retriever');
    await flush();
    expect(worker.posted[0]).toMatchObject({ type: 'embedText', text: 'a golden retriever' });

    const id = (worker.posted[0] as { id: string }).id;
    const vector = new Float32Array(512).fill(0.25).buffer;
    worker?.respond({ type: 'embedResult', id, ok: true, vector });

    const result = await promise;
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(512);
    expect(queue.completed).toBe(0); // doesn't count toward background-analysis progress
    expect(queue.pending).toBe(0); // doesn't occupy the analysis queue slot
  });

  it('embedText() rejects when the worker reports an error', async () => {
    const { worker, queue } = await readyQueue();

    const promise = queue.embedText('broken');
    await flush();
    const id = (worker.posted[0] as { id: string }).id;
    worker.respond({ type: 'embedResult', id, ok: false, error: 'model not loaded' });

    await expect(promise).rejects.toThrow('model not loaded');
  });

  it('destroy() terminates the worker', () => {
    let worker: FakeWorker | undefined;
    const platform = makePlatform();
    const queue = new AiQueue(platform, () => (worker = new FakeWorker()));
    queue.destroy();
    expect(worker?.terminated).toBe(true);
  });

  it('asks the worker to load the model after configure', async () => {
    let worker: FakeWorker | undefined;
    new AiQueue(makePlatform(), () => (worker = new FakeWorker()));
    await flush();
    expect(worker?.posted[0]).toMatchObject({ type: 'configure' });
    expect(worker?.posted[1]).toEqual({ type: 'load' });
    expect(useAiStatusStore.getState().status).toBe('loading');
  });

  it('sends no embedImage before the worker says ready', async () => {
    let worker: FakeWorker | undefined;
    const queue = new AiQueue(makePlatform(), () => (worker = new FakeWorker()));
    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    expect(worker?.posted.some((m) => (m as { type: string }).type === 'embedImage')).toBe(false);

    worker?.respond({ type: 'ready', provider: 'fake' });
    await flush();
    expect(worker?.posted.some((m) => (m as { type: string }).type === 'embedImage')).toBe(true);
  });

  it('a load error sets the status, keeps the queue and rejects embedText', async () => {
    let worker: FakeWorker | undefined;
    const queue = new AiQueue(makePlatform(), () => (worker = new FakeWorker()));
    queue.enqueue([{ itemId: 'a', cacheKey: 't512/a' }]);
    await flush();
    worker?.respond({ type: 'error', message: 'Could not locate file' });

    expect(useAiStatusStore.getState()).toMatchObject({
      status: 'error',
      error: 'Could not locate file',
    });
    expect(queue.pending).toBe(1);
    expect(queue.failed).toBe(0);
    await expect(queue.embedText('x')).rejects.toThrow('Could not locate file');
  });

  it('retry() asks the worker to load again', async () => {
    let worker: FakeWorker | undefined;
    const queue = new AiQueue(makePlatform(), () => (worker = new FakeWorker()));
    await flush();
    worker?.respond({ type: 'error', message: 'nope' });
    worker!.posted = [];

    queue.retry();
    await flush();
    expect(worker?.posted).toEqual([{ type: 'load' }]);
    expect(useAiStatusStore.getState().status).toBe('loading');
  });

  it('a crashed worker sets the status to error', async () => {
    let worker: FakeWorker | undefined;
    new AiQueue(makePlatform(), () => (worker = new FakeWorker()));
    await flush();
    worker?.onerror?.({ message: 'kaboom', preventDefault: () => {} } as ErrorEvent);
    expect(useAiStatusStore.getState()).toMatchObject({ status: 'error', error: 'kaboom' });
  });
});
