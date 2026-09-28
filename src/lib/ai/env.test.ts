import { describe, expect, it } from 'vitest';
import { computeAiEnvConfig, configureTransformersEnv, type TransformersEnvLike } from './env';

function fakeEnv(): TransformersEnvLike {
  return {
    allowRemoteModels: true,
    allowLocalModels: false,
    localModelPath: '',
    useBrowserCache: true,
    useFSCache: true,
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
  it('forces offline, local-only loading', () => {
    const env = fakeEnv();
    configureTransformersEnv(env, {
      localModelPath: 'http://media.localhost/models',
      wasmPaths: '/ort/',
    });
    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(true);
    expect(env.localModelPath).toBe('http://media.localhost/models');
    expect(env.useBrowserCache).toBe(false);
    expect(env.useFSCache).toBe(false);
    expect(env.backends.onnx.wasm.wasmPaths).toBe('/ort/');
  });

  it('falls back to a single thread outside cross-origin isolation', () => {
    const env = fakeEnv();
    const original = globalThis.crossOriginIsolated;
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    configureTransformersEnv(env, { localModelPath: null, wasmPaths: '/ort/' });
    expect(env.backends.onnx.wasm.numThreads).toBe(1);
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      value: original,
      configurable: true,
    });
  });
});
