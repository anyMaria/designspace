// §4.10: one L2-normalized Float32Array per item/value/query, shared shape whether it comes from
// the real CLIP model (`clipEmbeddingProvider.ts`, worker-only) or `FakeEmbeddingProvider` (tests
// and the browser dev build, where no model is bundled — see `src/lib/ai/env.ts`).

export interface EmbeddingProvider {
  readonly dims: number;
  /** `bytes` is the image file's raw bytes (the `t512` derivative in production — §4.7 step 3). */
  embedImage(bytes: ArrayBuffer, mime: string): Promise<Float32Array>;
  embedText(text: string): Promise<Float32Array>;
  /** Loads everything up front, so a broken model shows at once instead of on the first item. */
  warmUp?(): Promise<void>;
  dispose(): void;
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) sumSquares += vector[i] * vector[i];
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vector;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

/** Both inputs are expected to already be L2-normalized, so this is a plain dot product. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
