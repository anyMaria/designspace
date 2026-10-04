import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/platform/types';
import { requeueMissingThumbnails } from './missingThumbnails';

function fakePlatform(ids: string[], present: Set<string>) {
  const batch = vi.fn().mockResolvedValue(undefined);
  const has = vi.fn((keys: string[]) => Promise.resolve(keys.map((k) => present.has(k))));
  const platform = {
    db: { select: vi.fn().mockResolvedValue(ids.map((id) => ({ id }))), batch },
    cache: { has },
  } as unknown as Platform;
  return { platform, batch, has };
}

describe('requeueMissingThumbnails', () => {
  it('re-queues only items whose t128 is missing', async () => {
    const { platform, batch } = fakePlatform(['a', 'b', 'c'], new Set(['t128/b']));
    expect(await requeueMissingThumbnails(platform)).toBe(2);
    expect(batch).toHaveBeenCalledWith([
      { sql: 'UPDATE items SET derived_v = 0 WHERE id = ?', params: ['a'] },
      { sql: 'UPDATE items SET derived_v = 0 WHERE id = ?', params: ['c'] },
    ]);
  });

  it('writes nothing when every thumbnail exists', async () => {
    const { platform, batch } = fakePlatform(['a'], new Set(['t128/a']));
    expect(await requeueMissingThumbnails(platform)).toBe(0);
    expect(batch).not.toHaveBeenCalled();
  });

  it('checks the cache in batches of 500', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `i${i}`);
    const { platform, has } = fakePlatform(ids, new Set(ids.map((id) => `t128/${id}`)));
    await requeueMissingThumbnails(platform);
    expect(has.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 200]);
  });
});
