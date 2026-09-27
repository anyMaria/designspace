import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { readImage, readText } from '@tauri-apps/plugin-clipboard-manager';
import type {
  BackupInfo,
  DbRow,
  DbStatement,
  FileFilter,
  ImportResult,
  LibraryInfo,
  LinkMeta,
  Platform,
} from '@/platform/types';

function notYet(feature: string, milestone: string): never {
  throw new Error(`${feature} lands in ${milestone} — see docs/IMPLEMENTATION_PLAN.md §8.`);
}

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
    importFile: (file: File, onProgress?: (p: number) => void): Promise<ImportResult> => {
      // Chunked streaming (media_import_begin/chunk/finish, §4.4) lands with Adding in M1.
      void onProgress;
      return notYet(`media.importFile("${file.name}")`, 'M1');
    },
    importBytes: (name: string, bytes: Uint8Array) =>
      invoke<ImportResult>('media_import_bytes', { name, bytes: Array.from(bytes) }),
    importUrl: (url: string) => invoke<ImportResult>('net_download_image', { url }),
    originalUrl: (relPath: string): string => convertFileSrc(`original/${relPath}`, 'media'),
    reveal: (relPath: string) => invoke<void>('media_reveal', { relPath }),
    purge: (relPaths: string[]) => invoke<void>('media_purge', { relPaths }),
  };

  cache = {
    put: (key: string, bytes: Uint8Array) =>
      invoke<void>('cache_put', { key, bytes: Array.from(bytes) }),
    has: (keys: string[]) => invoke<boolean[]>('cache_has', { keys }),
    url: (key: string): string => convertFileSrc(`cache/${key}`, 'media'),
  };

  net = {
    linkMeta: (url: string) => invoke<LinkMeta>('net_link_meta', { url }),
    enabled: (): boolean => true,
  };

  embeddings = {
    put: (model: string, _entries: [string, Float32Array][]): Promise<void> =>
      notYet(`embeddings.put(${model})`, 'M6'),
    load: (model: string): Promise<Map<string, Float32Array>> =>
      notYet(`embeddings.load(${model})`, 'M6'),
  };

  backups = {
    now: (): Promise<BackupInfo> => invoke<BackupInfo>('backup_now'),
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
    saveFile: async (defaultName: string, bytes: Uint8Array): Promise<boolean> => {
      const path = await saveDialog({ defaultPath: defaultName });
      if (!path) return false;
      await invoke('app_write_file', { path, bytes: Array.from(bytes) });
      return true;
    },
  };

  shell = {
    openExternal: (url: string): Promise<void> => openUrl(url),
  };

  clipboard = {
    readImage: async (): Promise<Uint8Array | null> => {
      try {
        const img = await readImage();
        const rgba = await img.rgba();
        return new Uint8Array(rgba);
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
  };
}
