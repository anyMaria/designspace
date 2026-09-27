/**
 * The Platform abstraction — see docs/IMPLEMENTATION_PLAN.md §4.5. Everything the UI needs from
 * the outside world goes through this interface, implemented once for Tauri (src-tauri IPC +
 * media:// protocol) and once for the browser dev build (sql.js + IndexedDB). Nothing in
 * src/features, src/state or src/commands should import 'tauri' or 'sql.js' directly.
 */

export interface DbRow {
  [column: string]: string | number | null | Uint8Array;
}

export interface DbStatement {
  sql: string;
  params?: unknown[];
}

export interface LibraryInfo {
  id: string;
  path: string;
  name: string;
}

export interface ImportResult {
  relPath: string;
  hash: string;
  size: number;
  mime: string;
  duplicateOf?: string;
}

export interface LinkMeta {
  finalUrl: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

export interface BackupInfo {
  id: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface Platform {
  kind: 'tauri' | 'browser';

  db: {
    select<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
    batch(statements: DbStatement[]): Promise<void>;
  };

  library: {
    current(): LibraryInfo | null;
    create(path?: string): Promise<LibraryInfo>;
    open(path?: string): Promise<LibraryInfo>;
    recent(): Promise<LibraryInfo[]>;
  };

  media: {
    importPaths(paths: string[]): Promise<ImportResult[]>;
    importFile(file: File, onProgress?: (p: number) => void): Promise<ImportResult>;
    importBytes(name: string, bytes: Uint8Array): Promise<ImportResult>;
    importUrl(url: string): Promise<ImportResult>;
    originalUrl(relPath: string): string;
    reveal(relPath: string): Promise<void>;
    purge(relPaths: string[]): Promise<void>;
  };

  cache: {
    put(key: string, bytes: Uint8Array): Promise<void>;
    has(keys: string[]): Promise<boolean[]>;
    url(key: string): string;
  };

  net: {
    linkMeta(url: string): Promise<LinkMeta>;
    enabled(): boolean;
  };

  embeddings: {
    put(model: string, entries: [itemId: string, vector: Float32Array][]): Promise<void>;
    load(model: string): Promise<Map<string, Float32Array>>;
  };

  backups: {
    now(): Promise<BackupInfo>;
    list(): Promise<BackupInfo[]>;
    restore(id: string): Promise<void>;
  };

  dialogs: {
    openFiles(filters?: FileFilter[]): Promise<string[]>;
    openFolder(): Promise<string | null>;
    saveFile(defaultName: string, bytes: Uint8Array): Promise<boolean>;
  };

  shell: {
    openExternal(url: string): Promise<void>;
  };

  clipboard: {
    readImage(): Promise<Uint8Array | null>;
    readText(): Promise<string | null>;
  };
}
