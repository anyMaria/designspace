import { l2Normalize, type EmbeddingProvider } from './embeddingProvider';

const DIMS = 512;

// FNV-1a, 32-bit.
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — a small, fast, deterministic PRNG seeded from `hashString`.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tokenVector(token: string): Float32Array {
  const rand = mulberry32(hashString(token));
  const v = new Float32Array(DIMS);
  for (let i = 0; i < DIMS; i++) v[i] = rand() * 2 - 1;
  return v;
}

/** A bag-of-tokens hash embedding: two seeds sharing words end up with a positive cosine
 * similarity (their shared tokens' vectors add constructively), while unrelated seeds land near
 * zero — "deterministic vectors with controllable similarity" per the plan (§4.10), without
 * needing a real model. Tests control similarity purely through shared substrings in the seed
 * text they pass in. */
function vectorForSeed(seed: string): Float32Array {
  const tokens = seed.toLowerCase().match(/[a-z0-9]+/g) ?? [seed];
  const sum = new Float32Array(DIMS);
  for (const token of tokens) {
    const v = tokenVector(token);
    for (let i = 0; i < DIMS; i++) sum[i] += v[i];
  }
  return l2Normalize(sum);
}

/** For unit and e2e tests, and the browser dev build (huggingface.co is blocked in cloud
 * sessions — see CLAUDE.md — so no real model is ever bundled there). Image bytes are decoded as
 * UTF-8 text to get a seed: meaningless for real image bytes (production never uses this
 * provider for those), but lets tests pass plain text as "image bytes" to control similarity. */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly dims = DIMS;

  embedImage(bytes: ArrayBuffer): Promise<Float32Array> {
    return Promise.resolve(vectorForSeed(new TextDecoder().decode(bytes)));
  }

  embedText(text: string): Promise<Float32Array> {
    return Promise.resolve(vectorForSeed(text));
  }

  dispose(): void {}
}
