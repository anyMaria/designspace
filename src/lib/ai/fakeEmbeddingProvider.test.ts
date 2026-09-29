import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from './embeddingProvider';
import { FakeEmbeddingProvider } from './fakeEmbeddingProvider';

function textBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe('FakeEmbeddingProvider', () => {
  it('is deterministic — the same text always embeds to the same vector', async () => {
    const provider = new FakeEmbeddingProvider();
    const a = await provider.embedText('a golden retriever puppy');
    const b = await provider.embedText('a golden retriever puppy');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('is L2-normalized', async () => {
    const provider = new FakeEmbeddingProvider();
    const v = await provider.embedText('anything at all');
    let sumSquares = 0;
    for (const x of v) sumSquares += x * x;
    expect(Math.sqrt(sumSquares)).toBeCloseTo(1, 5);
  });

  it('gives related text a higher similarity than unrelated text', async () => {
    const provider = new FakeEmbeddingProvider();
    const dog = await provider.embedText('a golden retriever puppy in a park');
    const dogAgain = await provider.embedText('a golden retriever puppy running outside');
    const unrelated = await provider.embedText('a stack of blueprints on a desk');

    const related = cosineSimilarity(dog, dogAgain);
    const unrelatedScore = cosineSimilarity(dog, unrelated);
    expect(related).toBeGreaterThan(unrelatedScore);
  });

  it('treats image bytes as a UTF-8 seed, matching equivalent text', async () => {
    const provider = new FakeEmbeddingProvider();
    const fromImage = await provider.embedImage(textBytes('a red sports car'));
    const fromText = await provider.embedText('a red sports car');
    expect(Array.from(fromImage)).toEqual(Array.from(fromText));
  });

  it('has 512 dims', async () => {
    const provider = new FakeEmbeddingProvider();
    expect(provider.dims).toBe(512);
    expect((await provider.embedText('x')).length).toBe(512);
  });

  it('does not treat unrelated real (binary) images as similar just because they share a file format', async () => {
    // A minimal WebP header (RIFF/WEBP/VP8 ) followed by different "compressed data" bytes —
    // the shape every demo item's real thumbnail has. Before the fix, decoding these as UTF-8
    // made every image collapse to the same few header tokens and look near-identical.
    const provider = new FakeEmbeddingProvider();
    function fakeWebp(fill: number): ArrayBuffer {
      const bytes = new Uint8Array(64);
      const header = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
      bytes.set(header, 0);
      for (let i = header.length; i < bytes.length; i++) bytes[i] = (fill + i * 37) % 256;
      return bytes.buffer;
    }
    const a = await provider.embedImage(fakeWebp(11));
    const b = await provider.embedImage(fakeWebp(200));
    expect(cosineSimilarity(a, b)).toBeLessThan(0.5);
  });

  it('is still deterministic for the same real (binary) image bytes', async () => {
    const provider = new FakeEmbeddingProvider();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250, 251, 252]).buffer;
    const a = await provider.embedImage(bytes);
    const b = await provider.embedImage(bytes);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
