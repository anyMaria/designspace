import type {
  BackupInfo,
  FileFilter,
  FolderListing,
  ImportResult,
  LibraryInfo,
  LinkMeta,
  Platform,
} from '@/platform/types';
import { SqlJsDb } from './sqljsDb';
import { idbGet, idbHas, idbSet, STORE_CACHE, STORE_MEDIA } from './idbStore';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';

const LIBRARY_KEY = 'designspace.library';

function notSupported(feature: string): never {
  throw new Error(
    `${feature} isn't available in the browser dev build. This platform is for UI development ` +
      'and tests only — see docs/IMPLEMENTATION_PLAN.md §4.5.',
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const table: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return table[ext] ?? 'application/octet-stream';
}

export class BrowserPlatform implements Platform {
  readonly kind = 'browser';
  readonly db: Platform['db'];
  private sqljs: SqlJsDb;
  private libraryInfo: LibraryInfo | null = null;
  private objectUrls = new Map<string, string>();

  constructor() {
    this.sqljs = new SqlJsDb();
    this.db = this.sqljs;
    window.addEventListener('beforeunload', () => {
      void this.sqljs.flush();
    });
  }

  library = {
    current: (): LibraryInfo | null => this.libraryInfo,
    create: async (_path?: string): Promise<LibraryInfo> => {
      const info: LibraryInfo = { id: newId(), path: 'browser://library', name: 'Library' };
      this.libraryInfo = info;
      await idbSet('kv', LIBRARY_KEY, info);
      return info;
    },
    open: async (): Promise<LibraryInfo> => {
      const saved = await idbGet<LibraryInfo>('kv', LIBRARY_KEY);
      if (saved) {
        this.libraryInfo = saved;
        return saved;
      }
      return this.library.create();
    },
    recent: async (): Promise<LibraryInfo[]> => {
      const saved = await idbGet<LibraryInfo>('kv', LIBRARY_KEY);
      return saved ? [saved] : [];
    },
  };

  media = {
    importPaths: (_paths: string[]): Promise<ImportResult[]> => notSupported('media.importPaths'),
    importFile: async (file: File): Promise<ImportResult> => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.media.importBytes(file.name, bytes);
    },
    importBytes: async (name: string, bytes: Uint8Array): Promise<ImportResult> => {
      const hash = await sha256Hex(bytes);
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const relPath = `media/${yyyy}/${mm}/${newId()}-${name}`;
      const mime = guessMime(name);
      // ArrayBuffer copy avoids the "detached buffer" trap when the caller reuses `bytes`.
      const blob = new Blob([bytes.slice()], { type: mime });
      await idbSet(STORE_MEDIA, relPath, blob);
      this.cacheObjectUrl(STORE_MEDIA, relPath, blob);
      return { relPath, hash, size: bytes.byteLength, mime };
    },
    importUrl: (_url: string): Promise<ImportResult> => notSupported('media.importUrl'),
    originalUrl: (relPath: string): string => this.objectUrlFor(STORE_MEDIA, relPath),
    reveal: (): Promise<void> => notSupported('media.reveal'),
    purge: (): Promise<void> => notSupported('media.purge'),
    listFolder: (): Promise<FolderListing> => notSupported('media.listFolder'),
  };

  cache = {
    put: async (key: string, bytes: Uint8Array): Promise<void> => {
      const blob = new Blob([bytes.slice()]);
      await idbSet(STORE_CACHE, key, blob);
      this.cacheObjectUrl(STORE_CACHE, key, blob);
    },
    has: async (keys: string[]): Promise<boolean[]> =>
      Promise.all(keys.map((k) => idbHas(STORE_CACHE, k))),
    url: (key: string): string => this.objectUrlFor(STORE_CACHE, key),
  };

  net = {
    linkMeta: (url: string): Promise<LinkMeta> => {
      const domain = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      })();
      return Promise.resolve({
        finalUrl: url,
        title: null,
        description: null,
        siteName: domain,
        imageUrl: null,
        faviconUrl: null,
      });
    },
    enabled: (): boolean => false,
  };

  embeddings = {
    put: async (model: string, entries: [string, Float32Array][]): Promise<void> => {
      const existing = (await idbGet<Record<string, number[]>>('kv', `embeddings:${model}`)) ?? {};
      for (const [id, vec] of entries) existing[id] = Array.from(vec);
      await idbSet('kv', `embeddings:${model}`, existing);
    },
    load: async (model: string): Promise<Map<string, Float32Array>> => {
      const existing = (await idbGet<Record<string, number[]>>('kv', `embeddings:${model}`)) ?? {};
      return new Map(Object.entries(existing).map(([id, v]) => [id, Float32Array.from(v)]));
    },
  };

  backups = {
    now: (): Promise<BackupInfo> => notSupported('backups.now'),
    list: (): Promise<BackupInfo[]> => Promise.resolve([]),
    restore: (): Promise<void> => notSupported('backups.restore'),
  };

  dialogs = {
    openFiles: (_filters?: FileFilter[]): Promise<string[]> => notSupported('dialogs.openFiles'),
    openFolder: (): Promise<string | null> => notSupported('dialogs.openFolder'),
    saveFile: (defaultName: string, bytes: Uint8Array): Promise<boolean> => {
      const blob = new Blob([bytes.slice()]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      return Promise.resolve(true);
    },
  };

  shell = {
    openExternal: (url: string): Promise<void> => {
      window.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve();
    },
  };

  clipboard = {
    readImage: async (): Promise<Uint8Array | null> => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type) {
            const blob = await item.getType(type);
            return new Uint8Array(await blob.arrayBuffer());
          }
        }
      } catch {
        // Clipboard permission denied or unavailable — the paste handler falls back to text/files.
      }
      return null;
    },
    readText: async (): Promise<string | null> => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    },
    writeImage: async (bytes: Uint8Array, mime: string): Promise<void> => {
      // Re-encode to PNG — the Clipboard API's ClipboardItem support for arbitrary source
      // mime types (e.g. image/jpeg) is inconsistent across browsers; PNG always works.
      const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: mime }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    },
  };

  /** Caches a blob: URL for a store/key pair at write time, so `originalUrl`/`cache.url` — which
   * the Platform interface requires to be synchronous — can return it immediately afterwards.
   * A page reload loses this in-memory map; BrowserPlatform is for dev and tests only (§4.5),
   * and the real texture pipeline (M1, §4.6) re-derives everything from the DB on load anyway. */
  private cacheObjectUrl(store: string, key: string, blob: Blob): void {
    this.objectUrls.set(`${store}:${key}`, URL.createObjectURL(blob));
  }

  private objectUrlFor(store: string, key: string): string {
    const existing = this.objectUrls.get(`${store}:${key}`);
    if (existing) return existing;
    logger.warn(`No cached blob URL for ${store}:${key} — was it imported/cached this session?`);
    return '';
  }
}
