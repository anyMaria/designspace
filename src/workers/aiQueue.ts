import type { DbRow, Platform } from '@/platform';
import { useSettingsStore } from '@/state/settingsStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import { computeAiEnvConfig } from '@/lib/ai/env';
import { CLIP_MODEL } from '@/lib/ai/model';
import { logger } from '@/lib/logger';
import type {
  AiWorkerRequest,
  AiWorkerResponse,
  EmbedImageRequest,
  EmbedTextRequest,
} from './ai.worker';

/** Minimal Worker surface this module needs — lets tests inject a fake (mirrors `IngestQueue`'s
 * `WorkerLike`, `src/workers/ingestQueue.ts`). */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface AiQueueItem {
  itemId: string;
  /** The `cache.put` key holding the bitmap to embed — the `t512` derivative every visual kind
   * shares (§4.7 step 3: "with AI on, queue an embedding from the t512 bitmap"). */
  cacheKey: string;
}

export { CLIP_MODEL };

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
}

/** Background analysis (§4.10): one item at a time, low priority, pausable — mirrors
 * `IngestQueue`'s pool pattern but with a pool of exactly one worker, since loading the model is
 * expensive and inference within a single call already uses however many WASM threads
 * `configureTransformersEnv` granted it. */
export class AiQueue {
  private platform: Platform;
  private worker: WorkerLike;
  private queue: AiQueueItem[] = [];
  private busy = false;
  private paused = false;
  private nextReqId = 0;
  private configured: Promise<void>;
  private listeners = new Set<() => void>();
  /** Pending `embedText` requests (value/prompt embeddings, search-by-meaning queries) — these
   * bypass the background-analysis queue entirely: they're interactive, small, and share the
   * same worker/model instance rather than spinning up a second one. */
  private pendingText = new Map<
    string,
    { resolve: (v: Float32Array) => void; reject: (e: Error) => void }
  >();
  completed = 0;
  failed = 0;

  constructor(platform: Platform, workerFactory: () => WorkerLike = defaultWorkerFactory) {
    this.platform = platform;
    this.worker = workerFactory();
    this.worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
      this.handleResult(event.data);
    };
    this.configured = computeAiEnvConfig(platform.kind).then((config) => {
      const message: AiWorkerRequest = { type: 'configure', config };
      this.worker.postMessage(message);
    });
  }

  enqueue(items: AiQueueItem[]): void {
    this.queue.push(...items);
    this.pump();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  get pending(): number {
    return this.queue.length + (this.busy ? 1 : 0);
  }

  /** Settings → AI (M6-5) subscribes to this to show live progress. Returns an unsubscribe fn. */
  onProgress(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private pump(): void {
    if (this.paused || this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    this.notify();
    void this.dispatch(next);
  }

  private async dispatch(item: AiQueueItem): Promise<void> {
    await this.configured;
    try {
      const url = this.platform.cache.url(item.cacheKey);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetching ${item.cacheKey} failed: ${res.status}`);
      const bytes = await res.arrayBuffer();
      const req: EmbedImageRequest = {
        type: 'embedImage',
        id: `req-${++this.nextReqId}`,
        itemId: item.itemId,
        bytes,
        mime: 'image/webp',
      };
      this.worker.postMessage(req, [bytes]);
    } catch (err) {
      logger.error(`AI: couldn't read the thumbnail for ${item.itemId}`, err);
      this.failed++;
      this.busy = false;
      this.pump();
    }
  }

  private handleResult(result: AiWorkerResponse): void {
    if (result.type !== 'embedResult') return;

    const textRequest = this.pendingText.get(result.id);
    if (textRequest) {
      this.pendingText.delete(result.id);
      if (result.ok) textRequest.resolve(new Float32Array(result.vector));
      else textRequest.reject(new Error(result.error));
      return;
    }

    const itemId = result.itemId;
    if (!itemId) return;
    this.busy = false;

    if (!result.ok) {
      logger.warn(`AI embedding failed for ${itemId}: ${result.error}`);
      this.failed++;
      this.notify();
      this.pump();
      return;
    }

    const vector = new Float32Array(result.vector);
    this.platform.embeddings
      .put(CLIP_MODEL, [[itemId, vector]])
      .then(() => {
        this.completed++;
        // Keeps "Similar look" connections/Constellations and Find similar live as background
        // analysis progresses, without their own async round trip (§4.10).
        useEmbeddingsStore.getState().upsert(itemId, vector);
      })
      .catch((err: unknown) => {
        logger.error('AI: failed to persist an embedding', err);
        this.failed++;
      })
      .finally(() => {
        this.notify();
        this.pump();
      });
  }

  /** Embeds arbitrary text (a value's prompt templates, §4.10 Appendix B; a search-by-meaning
   * query) — shares this queue's worker/model rather than loading a second one, and doesn't
   * consume a background-analysis queue slot. */
  async embedText(text: string): Promise<Float32Array> {
    await this.configured;
    return new Promise((resolve, reject) => {
      const id = `text-${++this.nextReqId}`;
      this.pendingText.set(id, { resolve, reject });
      const req: EmbedTextRequest = { type: 'embedText', id, text };
      this.worker.postMessage(req);
    });
  }

  destroy(): void {
    this.worker.terminate();
  }
}

let instance: AiQueue | null = null;

/** `null` if a worker genuinely can't be created in this environment (a `Worker`-less test
 * runner: `ingestQueue.test.ts` and friends call `persist()` directly, which now also calls
 * `queueAiAnalysis` — real browsers, including the Playwright/WebView2 targets this app actually
 * ships to, always have `Worker`). Ingest must never fail because AI analysis couldn't start. */
export function getAiQueue(platform: Platform): AiQueue | null {
  if (instance) return instance;
  try {
    instance = new AiQueue(platform);
    return instance;
  } catch (err) {
    logger.warn('AI: could not create the analysis worker', err);
    return null;
  }
}

interface PendingRow extends DbRow {
  id: string;
}

/** Re-queues items with no embedding yet under the current model — §4.7's "resumable" for AI
 * analysis. Call once at startup after the library and settings are loaded (settings first: if
 * AI is off, this is a no-op). */
export async function resumePendingAiAnalysis(platform: Platform): Promise<void> {
  if (!useSettingsStore.getState().aiEnabled) return;
  const rows = await platform.db.select<PendingRow>(
    `SELECT id FROM items
     WHERE status = 'ok' AND deleted_at IS NULL
       AND id NOT IN (SELECT item_id FROM embeddings WHERE model = ?)`,
    [CLIP_MODEL],
  );
  if (rows.length === 0) return;
  getAiQueue(platform)?.enqueue(rows.map((r) => ({ itemId: r.id, cacheKey: `t512/${r.id}` })));
}

/** Queues a single item for embedding — call right after its `t512` derivative lands (§4.7 step
 * 3), so a freshly-ingested item gets suggestions within the plan's "about 2 s" (§8 M6
 * acceptance) without waiting for the next full resume. No-ops when AI is off. */
export function queueAiAnalysis(platform: Platform, itemId: string): void {
  if (!useSettingsStore.getState().aiEnabled) return;
  getAiQueue(platform)?.enqueue([{ itemId, cacheKey: `t512/${itemId}` }]);
}
