import { describe, expect, it, vi } from 'vitest';
import { thumbUrl } from './thumbs';
import type { Platform } from '@/platform/types';

describe('thumbUrl', () => {
  it('passes the cache key and the item’s thumbnail version', () => {
    const url = vi.fn((key: string, v?: number) => `u:${key}:${v}`);
    const platform = { cache: { url } } as unknown as Platform;
    expect(thumbUrl(platform, { id: 'a', thumbV: 3 }, 128)).toBe('u:t128/a:3');
    expect(thumbUrl(platform, { id: 'a' }, 512)).toBe('u:t512/a:0');
  });
});
