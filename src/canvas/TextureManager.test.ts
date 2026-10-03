import { describe, expect, it, vi } from 'vitest';
import { TextureManager } from './TextureManager';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TextureManager', () => {
  it('decodes and caches, returning the same instance on a second request', async () => {
    const decode = vi
      .fn<(url: string) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: 'tex' });
    const manager = new TextureManager({ decode, destroyItem: vi.fn() });

    const a = await manager.request('key1', 'url1');
    const b = await manager.request('key1', 'url1');
    expect(a).toBe(b);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same key', async () => {
    const d = deferred<{ id: string }>();
    const decode = vi.fn<(url: string) => Promise<{ id: string }>>().mockReturnValue(d.promise);
    const manager = new TextureManager({ decode, destroyItem: vi.fn() });

    const p1 = manager.request('key1', 'url1');
    const p2 = manager.request('key1', 'url1');
    d.resolve({ id: 'tex' });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('resolves null (not a rejection) when decoding fails', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('bad image'));
    const manager = new TextureManager({ decode, destroyItem: vi.fn() });
    await expect(manager.request('key1', 'url1')).resolves.toBeNull();
  });

  it('limits concurrent decodes to maxConcurrentDecodes', async () => {
    let active = 0;
    let maxActive = 0;
    const decode = vi.fn().mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return {};
    });
    const manager = new TextureManager({ decode, destroyItem: vi.fn(), maxConcurrentDecodes: 2 });

    await Promise.all([
      manager.request('a', 'a'),
      manager.request('b', 'b'),
      manager.request('c', 'c'),
      manager.request('d', 'd'),
    ]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('evicts the least-recently-used item once over the cache limit', async () => {
    const destroyed: string[] = [];
    const decode = vi.fn().mockImplementation((url: string) => Promise.resolve({ id: url }));
    const manager = new TextureManager<{ id: string }>({
      decode,
      destroyItem: (item) => destroyed.push(item.id),
      maxCachedItems: 2,
    });

    await manager.request('a', 'a');
    await manager.request('b', 'b');
    await manager.request('a', 'a'); // touches 'a' again, so 'b' becomes the LRU one
    await manager.request('c', 'c'); // pushes the cache over the limit

    expect(destroyed).toEqual(['b']);
    expect(manager.cachedCount).toBe(2);
    expect(manager.has('a')).toBe(true);
    expect(manager.has('c')).toBe(true);
  });

  it('destroy() clears the cache and calls destroyItem for everything', async () => {
    const destroyed: string[] = [];
    const decode = vi.fn().mockImplementation((url: string) => Promise.resolve({ id: url }));
    const manager = new TextureManager<{ id: string }>({
      decode,
      destroyItem: (i) => destroyed.push(i.id),
    });
    await manager.request('a', 'a');
    await manager.request('b', 'b');
    manager.destroy();
    expect(destroyed.sort()).toEqual(['a', 'b']);
    expect(manager.cachedCount).toBe(0);
  });

  it('touch() protects a cached key from eviction and ignores uncached keys', async () => {
    const destroyed: string[] = [];
    const decode = vi.fn().mockImplementation((url: string) => Promise.resolve({ id: url }));
    const manager = new TextureManager<{ id: string }>({
      decode,
      destroyItem: (item) => destroyed.push(item.id),
      maxCachedItems: 2,
    });

    await manager.request('a', 'a');
    await manager.request('b', 'b');
    manager.touch('a'); // 'b' is now the least recently used
    manager.touch('never-loaded'); // must not throw or create an entry
    await manager.request('c', 'c');

    expect(destroyed).toEqual(['b']);
    expect(manager.cachedCount).toBe(2);
  });

  it('passes the key to destroyItem on eviction and on destroy()', async () => {
    const destroyed: string[] = [];
    const decode = vi.fn().mockImplementation((url: string) => Promise.resolve({ id: url }));
    const manager = new TextureManager<{ id: string }>({
      decode,
      destroyItem: (_item, key) => destroyed.push(key),
      maxCachedItems: 1,
    });
    await manager.request('k1', 'u1');
    await manager.request('k2', 'u2');
    expect(destroyed).toEqual(['k1']);
    manager.destroy();
    expect(destroyed).toEqual(['k1', 'k2']);
  });
});
