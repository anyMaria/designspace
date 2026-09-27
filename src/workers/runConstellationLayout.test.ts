import { describe, expect, it } from 'vitest';
import { runConstellationLayout } from './runConstellationLayout';
import type { WorkerLike } from './ingestQueue';
import type { LayoutResponse } from './layout.worker';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {}

  respond(data: LayoutResponse): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('runConstellationLayout', () => {
  it('resolves with the layout once the worker responds with the matching request id', async () => {
    const worker = new FakeWorker();
    const promise = runConstellationLayout(worker, {
      visibleItemIds: ['a', 'b'],
      activeCriteria: ['vibe'],
      items: [],
      itemTerms: new Map(),
      terms: new Map(),
      manualConnections: [],
    });

    expect(worker.posted).toHaveLength(1);
    const sent = worker.posted[0] as { id: string };
    worker.respond({
      id: sent.id,
      itemPositions: new Map([['a', { x: 0, y: 0 }]]),
      hubs: [],
      unclassifiedIds: ['a', 'b'],
    });

    const layout = await promise;
    expect(layout.itemPositions.get('a')).toEqual({ x: 0, y: 0 });
    expect(layout.unclassifiedIds).toEqual(['a', 'b']);
  });

  it('rejects on a worker error', async () => {
    const worker = new FakeWorker();
    const promise = runConstellationLayout(worker, {
      visibleItemIds: [],
      activeCriteria: [],
      items: [],
      itemTerms: new Map(),
      terms: new Map(),
      manualConnections: [],
    });
    worker.onerror?.({ message: 'boom' } as ErrorEvent);
    await expect(promise).rejects.toThrow('boom');
  });
});
