import { describe, expect, it, vi } from 'vitest';
import { candidatesOf, importFirstImage } from './linkCover';
import type { ImportResult } from '@/platform/types';

const ok = (relPath: string): ImportResult => ({ relPath, hash: 'h', size: 1, mime: 'image/png' });

describe('importFirstImage', () => {
  it('tries candidates in order and stops at the first image', async () => {
    const importUrl = vi
      .fn<(u: string) => Promise<ImportResult>>()
      .mockRejectedValueOnce(new Error('not an image'))
      .mockResolvedValueOnce(ok('b.png'));
    const result = await importFirstImage(['a', 'b', 'c'], importUrl);
    expect(result?.relPath).toBe('b.png');
    expect(importUrl.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('returns null when none downloads', async () => {
    const importUrl = vi.fn().mockRejectedValue(new Error('no'));
    expect(await importFirstImage(['a', 'b'], importUrl)).toBeNull();
    expect(importUrl).toHaveBeenCalledTimes(2);
  });

  it('returns null for no candidates', async () => {
    expect(await importFirstImage([], vi.fn())).toBeNull();
  });
});

describe('candidatesOf', () => {
  it('merges the list with the old single image, without repeats', () => {
    expect(candidatesOf({ imageCandidates: ['a', 'b'], imageUrl: 'b' })).toEqual(['a', 'b']);
    expect(candidatesOf({ imageUrl: 'x' })).toEqual(['x']);
    expect(candidatesOf({ imageUrl: null })).toEqual([]);
  });
});
