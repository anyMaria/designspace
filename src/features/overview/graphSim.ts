import type { WorkerLike } from '@/workers/ingestQueue';
import type {
  GraphHub,
  GraphInit,
  GraphSimRequest,
  GraphSimResponse,
} from '@/workers/graphSim.protocol';

/** Where every node is right now, updated by frames from the worker. Read it in the drawing loop;
 * it is not React state, so 60 frames a second never re-render anything. */
export class LivePositions {
  private ids = new Map<string, number>();
  private buf: Float32Array | null = null;
  /** Bumped by every frame. */
  version = 0;

  setIds(ids: string[]): void {
    this.ids = new Map(ids.map((id, i) => [id, i]));
    this.buf = null;
  }

  update(positions: Float32Array): void {
    this.buf = positions;
    this.version++;
  }

  get ready(): boolean {
    return this.buf !== null;
  }

  get(id: string): { x: number; y: number } | undefined {
    const i = this.ids.get(id);
    if (i === undefined || !this.buf) return undefined;
    return { x: this.buf[i * 2], y: this.buf[i * 2 + 1] };
  }

  /** Every node's position, for fitting the camera. */
  all(): { x: number; y: number }[] {
    if (!this.buf) return [];
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < this.buf.length; i += 2) out.push({ x: this.buf[i], y: this.buf[i + 1] });
    return out;
  }
}

export interface GraphSimEvents {
  onGraph: (hubs: GraphHub[]) => void;
  /** Positions changed (a frame arrived). */
  onFrame: () => void;
  onSettled: () => void;
  onError: (message: string) => void;
}

/** The first answer must come within this long, or the Overview says the map couldn't be
 * arranged (instead of waiting forever). */
export const GRAPH_SIM_TIMEOUT_MS = 5000;

/** The main-thread end of the live graph (Patch 3 · D1): starts the worker, keeps the latest
 * positions, and forwards drags, releases and Spacing changes. */
export class GraphSim {
  readonly live = new LivePositions();
  private worker: WorkerLike;
  private timeout: ReturnType<typeof setTimeout> | null;
  private stopped = false;

  private readonly events: GraphSimEvents;

  constructor(
    workerFactory: () => WorkerLike,
    events: GraphSimEvents,
    timeoutMs = GRAPH_SIM_TIMEOUT_MS,
  ) {
    this.events = events;
    this.worker = workerFactory();
    this.worker.onmessage = (e: MessageEvent<GraphSimResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => this.fail(e.message || 'The layout worker stopped.');
    this.timeout = setTimeout(() => this.fail('The layout took too long.'), timeoutMs);
  }

  init(init: GraphInit): void {
    this.send({ type: 'init', init });
  }

  drag(id: string, x: number, y: number): void {
    this.send({ type: 'drag', id, x, y });
  }

  release(id: string): void {
    this.send({ type: 'release', id });
  }

  setSpacing(value: number): void {
    this.send({ type: 'spacing', value });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimeout();
    try {
      this.worker.postMessage({ type: 'stop' } satisfies GraphSimRequest);
    } catch {
      // the worker is already gone
    }
    this.worker.terminate();
  }

  private send(message: GraphSimRequest): void {
    if (!this.stopped) this.worker.postMessage(message);
  }

  private clearTimeout(): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private fail(message: string): void {
    if (this.stopped) return;
    this.clearTimeout();
    this.events.onError(message);
  }

  private handle(msg: GraphSimResponse): void {
    if (this.stopped) return;
    switch (msg.type) {
      case 'graph':
        this.live.setIds(msg.ids);
        this.events.onGraph(msg.hubs);
        break;
      case 'frame':
        this.clearTimeout();
        this.live.update(msg.positions);
        this.events.onFrame();
        break;
      case 'settled':
        this.events.onSettled();
        break;
      case 'error':
        this.fail(msg.message);
        break;
    }
  }
}

export function defaultGraphWorkerFactory(): WorkerLike {
  return new Worker(new URL('../../workers/graphSim.worker.ts', import.meta.url), {
    type: 'module',
  });
}
