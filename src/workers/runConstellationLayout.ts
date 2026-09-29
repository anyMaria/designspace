import type { WorkerLike } from './ingestQueue';
import type { LayoutRequest, LayoutResponse } from './layout.worker';
import type { ConstellationLayout } from '@/lib/constellations';

let nextReqId = 0;

export function defaultLayoutWorkerFactory(): WorkerLike {
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
}

/** One-shot request/response over a `layout.worker` instance — M3-7's Constellations toggle
 * creates one worker per run (unlike `IngestQueue`'s pool, there's only ever one layout in
 * flight at a time, and a stale in-progress run is simply abandoned by terminating the worker). */
export function runConstellationLayout(
  worker: WorkerLike,
  request: Omit<LayoutRequest, 'id'>,
): Promise<ConstellationLayout> {
  const id = String(nextReqId++);
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
      if (event.data.id !== id) return;
      const { id: _id, ...layout } = event.data;
      resolve(layout);
    };
    worker.onerror = (err) => reject(new Error(err.message));
    worker.postMessage({ id, ...request });
  });
}
