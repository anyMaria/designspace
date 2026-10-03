/**
 * Decodes and LRU-caches textures for the canvas engine — §4.6. Generic over the decoded
 * resource type so the LRU/concurrency/dedup logic can be unit tested without a real GPU;
 * `Engine` instantiates it with Pixi's `Texture`.
 */
export interface TextureManagerOptions<T> {
  decode: (url: string) => Promise<T>;
  destroyItem: (item: T, key: string) => void;
  maxConcurrentDecodes?: number;
  maxCachedItems?: number;
}

export class TextureManager<T> {
  private cache = new Map<string, T>();
  /** Least recently used first (a Map keeps insertion order); `touch` re-inserts at the end. */
  private lru = new Map<string, true>();
  private inFlight = new Map<string, Promise<T | null>>();
  private waiters: (() => void)[] = [];
  private activeDecodes = 0;

  private readonly decodeFn: (url: string) => Promise<T>;
  private readonly destroyItem: (item: T, key: string) => void;
  private readonly maxConcurrent: number;
  private readonly maxCached: number;

  constructor(opts: TextureManagerOptions<T>) {
    this.decodeFn = opts.decode;
    this.destroyItem = opts.destroyItem;
    this.maxConcurrent = opts.maxConcurrentDecodes ?? 6;
    this.maxCached = opts.maxCachedItems ?? 1500;
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) this.touch(key);
    return item;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Requests a texture, decoding it if needed. Concurrent requests for the same key share one
   * decode. Resolves `null` on decode failure rather than rejecting, so callers can fall back
   * to the flat-color placeholder without a try/catch at every call site. */
  async request(key: string, url: string): Promise<T | null> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.touch(key);
      return cached;
    }
    const inFlight = this.inFlight.get(key);
    if (inFlight) return inFlight;

    const promise = this.decode(key, url);
    this.inFlight.set(key, promise);
    return promise;
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeDecodes < this.maxConcurrent) {
      this.activeDecodes++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeDecodes++;
  }

  private releaseSlot(): void {
    this.activeDecodes--;
    const next = this.waiters.shift();
    next?.();
  }

  private async decode(key: string, url: string): Promise<T | null> {
    await this.acquireSlot();
    try {
      const item = await this.decodeFn(url);
      this.cache.set(key, item);
      this.touch(key);
      this.evictIfNeeded();
      return item;
    } catch {
      return null;
    } finally {
      this.releaseSlot();
      this.inFlight.delete(key);
    }
  }

  /** Marks a cached texture as recently used (so on-screen textures are never evicted). Does
   * nothing for a key that isn't cached (still loading, or never loaded). */
  touch(key: string): void {
    if (!this.cache.has(key)) return;
    this.lru.delete(key);
    this.lru.set(key, true);
  }

  private evictIfNeeded(): void {
    while (this.lru.size > this.maxCached) {
      const evictKey = this.lru.keys().next().value;
      if (evictKey === undefined) break;
      this.lru.delete(evictKey);
      const item = this.cache.get(evictKey);
      this.cache.delete(evictKey);
      if (item !== undefined) this.destroyItem(item, evictKey);
    }
  }

  get cachedCount(): number {
    return this.cache.size;
  }

  destroy(): void {
    for (const [key, item] of this.cache) this.destroyItem(item, key);
    this.cache.clear();
    this.lru.clear();
  }
}
