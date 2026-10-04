import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { readImage, readText, writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Image } from '@tauri-apps/api/image';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  AppPaths,
  ProblemReportInfo,
  BackupInfo,
  DbRow,
  DbStatement,
  FileFilter,
  FolderListing,
  ImportResult,
  LibraryInfo,
  LinkMeta,
  Platform,
} from '@/platform/types';
import { base64ToBytes, bytesToBase64 } from '@/lib/base64';

/** Talks to the Rust backend over `invoke` and the `media://` protocol. See §4.4–4.5.
 * M0 wires up the library/db/media-url surface; import, cache, embeddings, backups, net and
 * clipboard-image commands land with the milestones that use them (noted per method). */
export class TauriPlatform implements Platform {
  readonly kind = 'tauri';
  private libraryInfo: LibraryInfo | null = null;

  db: Platform['db'] = {
    select: <T extends DbRow = DbRow>(sql: string, params: unknown[] = []) =>
      invoke<T[]>('db_select', { sql, params }),
    execute: (sql: string, params: unknown[] = []) =>
      invoke<{ changes: number }>('db_execute', { sql, params }),
    batch: (statements: DbStatement[]) => invoke<void>('db_batch', { statements }),
  };

  library = {
    current: (): LibraryInfo | null => this.libraryInfo,
    create: async (path?: string): Promise<LibraryInfo> => {
      this.libraryInfo = await invoke<LibraryInfo>('library_create', { path });
      return this.libraryInfo;
    },
    open: async (path?: string): Promise<LibraryInfo> => {
      this.libraryInfo = await invoke<LibraryInfo>('library_open', { path });
      return this.libraryInfo;
    },
    recent: () => invoke<LibraryInfo[]>('recent_libraries'),
  };

  media = {
    importPaths: (paths: string[]) => invoke<ImportResult[]>('media_import_paths', { paths }),
    importFile: async (file: File, onProgress?: (p: number) => void): Promise<ImportResult> => {
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB, per §4.4
      const token = await invoke<string>('media_import_begin', {
        name: file.name,
        size: file.size,
      });
      let sent = 0;
      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const bytes = new Uint8Array(await slice.arrayBuffer());
        await invoke<void>('media_import_chunk', { token, bytes: Array.from(bytes) });
        sent += bytes.byteLength;
        onProgress?.(file.size === 0 ? 1 : sent / file.size);
      }
      return invoke<ImportResult>('media_import_finish', { token });
    },
    importBytes: (name: string, bytes: Uint8Array) =>
      invoke<ImportResult>('media_import_bytes', { name, bytes: Array.from(bytes) }),
    importUrl: (url: string) => invoke<ImportResult>('net_download_image', { url }),
    originalUrl: (relPath: string): string => convertFileSrc(`original/${relPath}`, 'media'),
    reveal: (relPath: string) => invoke<void>('media_reveal', { relPath }),
    purge: (relPaths: string[]) => invoke<void>('media_purge', { relPaths }),
    listFolder: (path: string) => invoke<FolderListing>('media_list_folder', { path }),
    readImage: (path: string) => invoke<ArrayBuffer>('media_read_image', { path }),
  };

  cache = {
    put: (key: string, bytes: Uint8Array) =>
      invoke<void>('cache_put', { key, bytes: Array.from(bytes) }),
    has: (keys: string[]) => invoke<boolean[]>('cache_has', { keys }),
    url: (key: string, version = 0): string => {
      const url = convertFileSrc(`cache/${key}`, 'media');
      return version > 0 ? `${url}?v=${version}` : url; // the protocol ignores the query
    },
    delete: async (keys: string[]): Promise<void> => {
      for (const key of keys) await invoke<void>('cache_delete', { prefix: key });
    },
    pruneOrphans: () => invoke<number>('cache_prune_orphans'),
  };

  net = {
    linkMeta: (url: string) => invoke<LinkMeta>('net_link_meta', { url }),
    enabled: (): boolean => true,
  };

  embeddings = {
    put: async (model: string, entries: [string, Float32Array][]): Promise<void> => {
      if (entries.length === 0) return;
      const dims = entries[0][1].length;
      const itemIds = entries.map(([id]) => id);
      const packed = new Uint8Array(entries.length * dims * 4);
      entries.forEach(([, vector], i) => {
        packed.set(
          new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength),
          i * dims * 4,
        );
      });
      await invoke<void>('embeddings_put', {
        model,
        itemIds,
        dims,
        vectorsB64: bytesToBase64(packed),
      });
    },
    load: async (model: string): Promise<Map<string, Float32Array>> => {
      const result = await invoke<{ itemIds: string[]; dims: number; vectorsB64: string }>(
        'embeddings_load',
        { model },
      );
      const bytes = base64ToBytes(result.vectorsB64);
      const map = new Map<string, Float32Array>();
      result.itemIds.forEach((id, i) => {
        const start = i * result.dims * 4;
        const vector = new Float32Array(bytes.buffer.slice(start, start + result.dims * 4));
        map.set(id, vector);
      });
      return map;
    },
  };

  backups = {
    now: (extraDestination?: string | null): Promise<BackupInfo> =>
      invoke<BackupInfo>('backup_now', { extraDestination: extraDestination ?? null }),
    list: (): Promise<BackupInfo[]> => invoke<BackupInfo[]>('backup_list'),
    restore: (id: string): Promise<void> => invoke<void>('backup_restore', { id }),
  };

  dialogs = {
    openFiles: async (filters?: FileFilter[]): Promise<string[]> => {
      const result = await openDialog({ multiple: true, filters });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    openFolder: async (): Promise<string | null> => {
      const result = await openDialog({ directory: true });
      return typeof result === 'string' ? result : null;
    },
    saveFile: (defaultName: string, bytes: Uint8Array): Promise<boolean> =>
      invoke<boolean>('dialog_save_file', { defaultName, bytes: Array.from(bytes) }),
  };

  libraryExport = {
    zip: (manifestJson: string, defaultName: string): Promise<boolean> =>
      invoke<boolean>('export_library_zip', { manifestJson, defaultName }),
  };

  shell = {
    openExternal: (url: string): Promise<void> => openUrl(url),
  };

  app = {
    paths: (): Promise<AppPaths> => invoke<AppPaths>('app_paths'),
    openLogs: (): Promise<void> => invoke<void>('open_logs'),
    problemReportInfo: (): Promise<ProblemReportInfo> =>
      invoke<ProblemReportInfo>('problem_report_info'),
  };

  machineSettings = {
    read: (): Promise<string | null> => invoke<string | null>('machine_settings_read'),
    write: (json: string): Promise<void> => invoke<void>('machine_settings_write', { json }),
  };

  window = {
    isFullscreen: (): Promise<boolean> => getCurrentWindow().isFullscreen(),
    setFullscreen: (on: boolean): Promise<void> => getCurrentWindow().setFullscreen(on),
    onFullscreenChange: (cb: (on: boolean) => void): (() => void) => {
      const unlisten = getCurrentWindow().onResized(() => {
        void getCurrentWindow().isFullscreen().then(cb);
      });
      return () => void unlisten.then((f) => f());
    },
  };

  clipboard = {
    // Returns PNG-encoded bytes (like BrowserPlatform's), not the plugin's raw RGBA buffer —
    // callers (paste, §2.3) need a real image file, and only this method has the width/height
    // needed to encode one.
    readImage: async (): Promise<Uint8Array | null> => {
      try {
        const img = await readImage();
        const { width, height } = await img.size();
        const rgba = await img.rgba();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      } catch {
        return null;
      }
    },
    readText: async (): Promise<string | null> => {
      try {
        return await readText();
      } catch {
        return null;
      }
    },
    writeImage: async (bytes: Uint8Array): Promise<void> => {
      const image = await Image.fromBytes(bytes);
      await writeImage(image);
    },
    writeText: async (text: string): Promise<void> => {
      await writeText(text);
    },
  };
}
