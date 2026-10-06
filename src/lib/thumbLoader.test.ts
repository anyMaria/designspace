import { describe, expect, it, vi } from 'vitest';
import { createThumbLoader, type ThumbLoaderOptions } from './thumbLoader';

const reply = (status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    blob: () => Promise.resolve(new Blob(['x'])),
  }) as Response;

function setup(overrides: Partial<ThumbLoaderOptions> = {}) {
  let active = 0;
  let peak = 0;
  const releases: (() => void)[] = [];
  const fetchFn = vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return reply(200);
  });
  let n = 0;
  const revoked: string[] = [];
  const loader = createThumbLoader({
    fetchFn,
    sleep: () => Promise.resolve(),
    createObjectURL: () => `blob:${++n}`,
    revokeObjectURL: (u) => revoked.push(u),
    maxConcurrent: 6,
    retryDelaysMs: [1, 2, 3],
    lruSize: 600,
    ...overrides,
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { loader, fetchFn, releases, revoked, peak: () => peak, flush };
}

describe('thumbLoader', () => {
  it('runs no more than 6 requests at once', async () => {
    const { loader, releases, peak, flush } = setup();
    const all = Array.from({ length: 20 }, (_, i) => loader.loadThumb(`http://m/${i}`));
    await flush();
    expect(releases.length).toBe(6);
    while (releases.length > 0) {
      releases.shift()?.();
      await flush();
    }
    await Promise.all(all);
    expect(peak()).toBe(6);
  });

  it('retries a failed request and then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(reply(500))
      .mockResolvedValue(reply(200));
    const { loader } = setup({ fetchFn });
    await expect(loader.loadThumb('http://m/a')).resolves.toMatch(/^blob:/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(loader.failedCount()).toBe(0);
  });

  it('gives up after 3 retries and counts the failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    const { loader } = setup({ fetchFn });
    await expect(loader.loadThumb('http://m/a')).rejects.toThrow('down');
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(loader.failedCount()).toBe(1);
  });

  it('shares one request for the same URL and caches the result', async () => {
    const { loader, fetchFn, releases, flush } = setup();
    const a = loader.loadThumb('http://m/a');
    const b = loader.loadThumb('http://m/a');
    await flush();
    releases.shift()?.();
    expect(await a).toBe(await b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await loader.loadThumb('http://m/a');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('revokes the oldest object URL when over the limit', async () => {
    const { loader, revoked, releases, flush } = setup({ lruSize: 2 });
    for (const name of ['a', 'b', 'c']) {
      const p = loader.loadThumb(`http://m/${name}`);
      await flush();
      releases.shift()?.();
      await p;
    }
    expect(revoked).toEqual(['blob:1']);
  });

  it('returns a blob: URL as it is', async () => {
    const { loader, fetchFn } = setup();
    await expect(loader.loadThumb('blob:abc')).resolves.toBe('blob:abc');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an aborted caller without breaking the shared request', async () => {
    const { loader, releases, flush } = setup();
    const controller = new AbortController();
    const aborted = loader.loadThumb('http://m/a', controller.signal);
    const other = loader.loadThumb('http://m/a');
    controller.abort();
    await expect(aborted).rejects.toThrow('Aborted');
    await flush();
    releases.shift()?.();
    await expect(other).resolves.toMatch(/^blob:/);
  });
});
