/** Loads thumbnails through one shared queue (Patch 3 · A3). The List, Details, Triage and the
 * pickers used plain `<img src>`, so at start-up hundreds of requests reached the `media://`
 * handler at once and a failed one stayed blank. This loader runs 6 at a time, retries a failed
 * request 3 times (after 0.5 s, 2 s and 5 s), shares requests for the same URL and keeps the
 * latest 600 object URLs. */

export interface ThumbLoaderOptions {
  fetchFn: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  maxConcurrent: number;
  retryDelaysMs: number[];
  lruSize: number;
}

export interface ThumbLoader {
  loadThumb(url: string, signal?: AbortSignal): Promise<string>;
  /** Thumbnails that still failed after every retry, this session. */
  failedCount(): number;
  reset(): void;
}

export function createThumbLoader(options: ThumbLoaderOptions): ThumbLoader {
  const {
    fetchFn,
    sleep,
    createObjectURL,
    revokeObjectURL,
    maxConcurrent,
    retryDelaysMs,
    lruSize,
  } = options;
  /** url → object URL; insertion order is the LRU order (oldest first). */
  const done = new Map<string, string>();
  const inflight = new Map<string, Promise<string>>();
  const waiting: (() => void)[] = [];
  let running = 0;
  let failed = 0;

  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (running >= maxConcurrent) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await work();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  async function fetchOnce(url: string): Promise<string> {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Thumbnail request failed (${res.status})`);
    const blob = await res.blob();
    return createObjectURL(blob);
  }

  async function fetchWithRetries(url: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await slot(() => fetchOnce(url));
      } catch (err) {
        if (attempt >= retryDelaysMs.length) {
          failed++;
          throw err;
        }
        await sleep(retryDelaysMs[attempt]);
      }
    }
  }

  function remember(url: string, objectUrl: string): void {
    done.set(url, objectUrl);
    while (done.size > lruSize) {
      const oldest = done.keys().next();
      if (oldest.done) break;
      const evicted = done.get(oldest.value);
      done.delete(oldest.value);
      if (evicted) revokeObjectURL(evicted);
    }
  }

  function withSignal(promise: Promise<string>, signal?: AbortSignal): Promise<string> {
    if (!signal) return promise;
    return new Promise<string>((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  return {
    loadThumb(url, signal) {
      // A blob: URL (the browser build) is already local.
      if (url.startsWith('blob:') || url.startsWith('data:')) return Promise.resolve(url);
      const cached = done.get(url);
      if (cached) {
        done.delete(url);
        done.set(url, cached); // most recently used
        return Promise.resolve(cached);
      }
      let shared = inflight.get(url);
      if (!shared) {
        shared = fetchWithRetries(url)
          .then((objectUrl) => {
            remember(url, objectUrl);
            return objectUrl;
          })
          .finally(() => inflight.delete(url));
        inflight.set(url, shared);
      }
      return withSignal(shared, signal);
    },
    failedCount: () => failed,
    reset() {
      for (const objectUrl of done.values()) revokeObjectURL(objectUrl);
      done.clear();
      failed = 0;
    },
  };
}

const defaultLoader = createThumbLoader({
  fetchFn: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  maxConcurrent: 6,
  retryDelaysMs: [500, 2000, 5000],
  lruSize: 600,
});

export const loadThumb = (url: string, signal?: AbortSignal): Promise<string> =>
  defaultLoader.loadThumb(url, signal);
export const failedThumbCount = (): number => defaultLoader.failedCount();
