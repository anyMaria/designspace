// Configures `@huggingface/transformers` (§4.10) so it only ever reads models and WASM binaries
// that shipped inside the installer, and never reaches the network. The main thread computes the
// paths (Tauri's `convertFileSrc` needs the Tauri API, which a plain Worker can't reach) and
// passes them to `ai.worker.ts` at startup, which calls `configureTransformersEnv` itself.

export interface AiEnvConfig {
  /** `null` in the browser dev build: no models are bundled there (huggingface.co is blocked in
   * cloud sessions — see CLAUDE.md), so the AI worker never loads a real model and callers fall
   * back to the `FakeEmbeddingProvider` instead. */
  localModelPath: string | null;
  /** Local copy of the ONNX Runtime WASM binaries — see `scripts/copy-ort-wasm.mjs`. */
  wasmPaths: string;
}

const WASM_PATHS = '/ort/';
export const BUNDLED_MODELS_PREFIX = '/bundled-models';

/** Runs on the main thread — `convertFileSrc` isn't reachable from a plain Worker. */
export async function computeAiEnvConfig(platformKind: 'tauri' | 'browser'): Promise<AiEnvConfig> {
  if (platformKind !== 'tauri') {
    return { localModelPath: null, wasmPaths: WASM_PATHS };
  }
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return { localModelPath: convertFileSrc('models', 'media'), wasmPaths: WASM_PATHS };
}

/** Minimal shape of the parts of transformers.js's `env` this app touches — kept narrow so this
 * module doesn't need to import `@huggingface/transformers` (a ~expensive import) just to
 * configure it, and so it's trivially testable with a plain object. */
export interface TransformersEnvLike {
  allowRemoteModels: boolean;
  allowLocalModels: boolean;
  localModelPath: string;
  useBrowserCache: boolean;
  useFSCache: boolean;
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  backends: { onnx: { wasm?: { wasmPaths?: string; numThreads?: number } } };
}

/** Local-only, offline env (§4.10): no remote fetches, no browser/FS caching of remote content —
 * everything must already be on disk, bundled at build time. */
export function configureTransformersEnv(env: TransformersEnvLike, config: AiEnvConfig): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  if (config.localModelPath) {
    // transformers.js skips its local-file lookups when localModelPath is an http:// URL (the
    // tokenizer then finds no files). Give it a plain path and translate it here.
    const base = config.localModelPath.replace(/\/$/, '');
    const realFetch = globalThis.fetch.bind(globalThis);
    env.localModelPath = BUNDLED_MODELS_PREFIX;
    env.fetch = (input, init) =>
      realFetch(String(input).replace(/^\/bundled-models(?=\/)/, base), init);
  } else {
    env.localModelPath = '';
  }
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.backends.onnx.wasm ??= {};
  env.backends.onnx.wasm.wasmPaths = config.wasmPaths;
  env.backends.onnx.wasm.numThreads = threadCount();
}

/** COOP/COEP (§4.12) enable `SharedArrayBuffer`; without cross-origin isolation, ONNX Runtime's
 * threaded WASM build can't be used safely, so fall back to a single thread. */
function threadCount(): number {
  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) return 1;
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}
