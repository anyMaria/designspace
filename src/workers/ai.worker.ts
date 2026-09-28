/// <reference lib="webworker" />
// §4.10's `ai.worker.ts`: lazily loads CLIP (or, when no model is bundled — the browser dev
// build — the `FakeEmbeddingProvider`) and computes image/text embeddings off the main thread.
// A plain Worker can't reach the Tauri API (`convertFileSrc` needs `window`), so the main thread
// computes the env config (`computeAiEnvConfig`, `src/lib/ai/env.ts`) and sends it once at
// startup via a `configure` message, before any embed request.

import { configureTransformersEnv, type AiEnvConfig, type TransformersEnvLike } from '@/lib/ai/env';
import { FakeEmbeddingProvider } from '@/lib/ai/fakeEmbeddingProvider';
import type { EmbeddingProvider } from '@/lib/ai/embeddingProvider';

declare const self: DedicatedWorkerGlobalScope;

export interface ConfigureMessage {
  type: 'configure';
  config: AiEnvConfig;
}

export interface EmbedImageRequest {
  type: 'embedImage';
  id: string;
  itemId: string;
  bytes: ArrayBuffer;
  mime: string;
}

export interface EmbedTextRequest {
  type: 'embedText';
  id: string;
  text: string;
}

export type AiWorkerRequest = ConfigureMessage | EmbedImageRequest | EmbedTextRequest;

export interface EmbedSuccess {
  type: 'embedResult';
  id: string;
  itemId?: string;
  ok: true;
  vector: ArrayBuffer;
}

export interface EmbedFailure {
  type: 'embedResult';
  id: string;
  itemId?: string;
  ok: false;
  error: string;
}

export type AiWorkerResponse = EmbedSuccess | EmbedFailure;

let provider: EmbeddingProvider | null = null;

/** A real model load can take real seconds — most callers only need it once, and later requests
 * queue behind the same in-flight promise rather than triggering their own concurrent load. */
let providerPromise: Promise<EmbeddingProvider> | null = null;

function loadProvider(config: AiEnvConfig | null): Promise<EmbeddingProvider> {
  providerPromise ??= (async () => {
    if (!config?.localModelPath) {
      // Browser dev build (or a `configure` message never arrived): no bundled model — §4.10,
      // CLAUDE.md ("use the fake embedding provider" in cloud sessions).
      return new FakeEmbeddingProvider();
    }
    const { env } = await import('@huggingface/transformers');
    // The real `env` singleton's types describe every backend transformers.js supports (WebGPU,
    // WebNN, …); `configureTransformersEnv` only touches the narrow slice this app uses.
    configureTransformersEnv(env as unknown as TransformersEnvLike, config);
    const { ClipEmbeddingProvider } = await import('@/lib/ai/clipEmbeddingProvider');
    return new ClipEmbeddingProvider();
  })();
  return providerPromise;
}

let envConfig: AiEnvConfig | null = null;

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const req = event.data;

  if (req.type === 'configure') {
    envConfig = req.config;
    return;
  }

  void handleEmbedRequest(req);
};

async function handleEmbedRequest(req: EmbedImageRequest | EmbedTextRequest): Promise<void> {
  try {
    provider ??= await loadProvider(envConfig);
    const vector =
      req.type === 'embedImage'
        ? await provider.embedImage(req.bytes, req.mime)
        : await provider.embedText(req.text);
    const response: EmbedSuccess = {
      type: 'embedResult',
      id: req.id,
      itemId: req.type === 'embedImage' ? req.itemId : undefined,
      ok: true,
      vector: vector.buffer as ArrayBuffer,
    };
    self.postMessage(response, [response.vector]);
  } catch (err) {
    const response: EmbedFailure = {
      type: 'embedResult',
      id: req.id,
      itemId: req.type === 'embedImage' ? req.itemId : undefined,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
}
