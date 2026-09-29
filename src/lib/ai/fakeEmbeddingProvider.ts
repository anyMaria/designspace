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

// Same FNV-1a over raw bytes rather than a string's char codes.
function hashBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** True only for bytes a test fixture would plausibly hand `embedImage` as a stand-in for real
 * image bytes (`new TextEncoder().encode('some words').buffer`, per the module doc below) — tab,
 * CR, LF and printable ASCII, nothing else. Real encoded images (WebP/PNG/…) fail this almost
 * immediately: every format's bytes include values outside this range within their first few
 * bytes (WebP's RIFF/WEBP/VP8 markers are followed by raw, unconstrained compressed data). */
function looksLikePlainTextFixture(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const printable = b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e);
    if (!printable) return false;
  }
  return true;
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
 * sessions — see CLAUDE.md — so no real model is ever bundled there). A fixture's plain-text
 * "image bytes" (`new TextEncoder().encode('some words').buffer`) decode as UTF-8 to get a seed,
 * letting tests control similarity through shared words. Real encoded images (every demo item's
 * WebP thumbnail, in the browser dev build) are meant to be "meaningless" here — decorrelated,
 * roughly-random similarity, since there's no real model — but decoding *them* as UTF-8 text
 * isn't meaningless at all: every image format's fixed header bytes (WebP's "RIFF"/"WEBP"/"VP8 ",
 * PNG's chunk names, …) survive the decode as the same few shared ASCII tokens on every image,
 * while the actual compressed pixel data mostly collapses to the replacement character and
 * vanishes from the token match — so every real image ends up embedding as *that shared header*,
 * making every image falsely "similar" to every other one (this is what made the suggestions
 * tray e2e test flaky: `boardSimilarSuggestions` treated the whole demo library as one cluster).
 * `looksLikePlainTextFixture` tells the two cases apart and only real encoded bytes fall back to
 * hashing the raw bytes instead. */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly dims = DIMS;

  embedImage(bytes: ArrayBuffer): Promise<Float32Array> {
    const arr = new Uint8Array(bytes);
    if (looksLikePlainTextFixture(arr)) {
      return Promise.resolve(vectorForSeed(new TextDecoder().decode(bytes)));
    }
    // Bypasses vectorForSeed's word-tokenizer on purpose: a seed like `bin-${hash}` would still
    // split into a shared "bin" token across every image, reintroducing the same false-positive
    // correlation this branch exists to avoid.
    return Promise.resolve(l2Normalize(tokenVector(String(hashBytes(arr)))));
  }

  embedText(text: string): Promise<Float32Array> {
    return Promise.resolve(vectorForSeed(text));
  }

  dispose(): void {}
}
