import { describe, expect, it, vi } from 'vitest';
import { computeAiEnvConfig, configureTransformersEnv, type TransformersEnvLike } from './env';

function fakeEnv(): TransformersEnvLike {
  return {
    allowRemoteModels: true,
    allowLocalModels: false,
    localModelPath: '',
    useBrowserCache: true,
    useFSCache: true,
    fetch: vi.fn(),
    backends: { onnx: { wasm: { wasmPaths: '' } } },
  };
}

describe('computeAiEnvConfig', () => {
  it('has no local model path in the browser build (no models are bundled there)', async () => {
    const config = await computeAiEnvConfig('browser');
    expect(config.localModelPath).toBeNull();
    expect(config.wasmPaths).toBe('/ort/');
  });
});

describe('configureTransformersEnv', () => {
  it('translates the plain model path to the real media URL in fetch', async () => {
    const realFetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', realFetch);
    const env = fakeEnv();
    configureTransformersEnv(env, {
      localModelPath: 'http://media.localhost/models/',
      wasmPaths: '/ort/',
    });
    await env.fetch('/bundled-models/X/config.json');
    expect(realFetch).toHaveBeenCalledWith(
      'http://media.localhost/models/X/config.json',
      undefined,
    );
    vi.unstubAllGlobals();
  });

  it('forces offline, local-only loading', () => {
    const env = fakeEnv();
    configureTransformersEnv(env, {
      localModelPath: 'http://media.localhost/models',
      wasmPaths: '/ort/',
    });
    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(true);
    expect(env.localModelPath).toBe('/bundled-models');
    expect(env.useBrowserCache).toBe(false);
    expect(env.useFSCache).toBe(false);
    expect(env.backends.onnx.wasm?.wasmPaths).toBe('/ort/');
  });

  it('falls back to a single thread outside cross-origin isolation', () => {
    const env = fakeEnv();
    const original = globalThis.crossOriginIsolated;
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    configureTransformersEnv(env, { localModelPath: null, wasmPaths: '/ort/' });
    expect(env.backends.onnx.wasm?.numThreads).toBe(1);
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      value: original,
      configurable: true,
    });
  });
});
