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

export interface FolderListing {
  paths: string[];
  skipped: number;
}

export interface ProblemReportInfo {
  appVersion: string;
  os: string;
  arch: string;
  webviewVersion: string | null;
  libraryId: string;
  storedLibraryId: string | null;
  cacheFolderCount: number;
  cacheFileCount: number;
  models: { name: string; present: boolean; bytes: number }[];
  logTail: string;
}

export interface AppPaths {
  appLocalDataDir: string;
  logsDir: string;
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
    /** Recursive folder listing for the Folder… entry point (§2.3) — Tauri only. */
    listFolder(path: string): Promise<FolderListing>;
    /** The bytes of a picture chosen with the file dialog, for sampling colours (Color studio) —
     * never stored in the library. Tauri only: only picture formats, at most 64 MB. */
    readImage(path: string): Promise<ArrayBuffer>;
    /** The bytes of a PDF picked with the file dialog (Patch 2 · G2); Tauri only. */
    readPdf(path: string): Promise<ArrayBuffer>;
  };

  cache: {
    put(key: string, bytes: Uint8Array): Promise<void>;
    has(keys: string[]): Promise<boolean[]>;
    /** `version` (an item's `thumbV`) is added to the URL so a re-made thumbnail never shows stale. */
    url(key: string, version?: number): string;
    delete(keys: string[]): Promise<void>;
    /** Removes cache folders of libraries that are no longer in use. Returns how many. */
    pruneOrphans(): Promise<number>;
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
    /** `extraDestination` (§5.4): an optional second folder (e.g. a OneDrive folder) that also
     * receives a copy of the backup, best-effort — a failure to copy there never fails the
     * backup itself. */
    now(extraDestination?: string | null): Promise<BackupInfo>;
    list(): Promise<BackupInfo[]>;
    restore(id: string): Promise<void>;
  };

  dialogs: {
    openFiles(filters?: FileFilter[]): Promise<string[]>;
    openFolder(): Promise<string | null>;
    saveFile(defaultName: string, bytes: Uint8Array): Promise<boolean>;
  };

  /** §5.4's library export (M7): a JSON file with all metadata, optionally zipped with the
   * media. The JSON itself is assembled by `src/features/export/exportLibrary.ts` from ordinary
   * `db.select` queries; only the ZIP variant needs a platform command, since streaming the
   * (potentially gigabytes-large) `media/` folder into an archive needs direct filesystem
   * access. Returns `false` if the owner cancels the Save dialog, matching `dialogs.saveFile`. */
  libraryExport: {
    zip(manifestJson: string, defaultName: string): Promise<boolean>;
  };

  shell: {
    openExternal(url: string): Promise<void>;
  };

  /** §2.14's Settings → About: "Open logs folder." */
  app: {
    paths(): Promise<AppPaths>;
    openLogs(): Promise<void>;
    problemReportInfo(): Promise<ProblemReportInfo>;
  };

  /** §5.5's machine settings (window/wheel mode/reduce motion/etc., as opposed to the library's
   * own `meta.settings`) — a single opaque JSON blob whose shape the frontend owns (see
   * `src/state/loadMachineSettings.ts`), mirroring `db.select`'s "thin bridge" pattern.
   * `read()` returns `null` when nothing has been saved yet. */
  machineSettings: {
    read(): Promise<string | null>;
    write(json: string): Promise<void>;
  };

  /** Immersive full screen (Patch 1 · B1). In the browser it uses the Fullscreen API, which only
   * works from a click or key press. */
  window: {
    isFullscreen(): Promise<boolean>;
    setFullscreen(on: boolean): Promise<void>;
    /** Called whenever full screen turns on or off (also when the OS or the browser leaves it).
     * Returns an unsubscribe function. */
    onFullscreenChange(cb: (on: boolean) => void): () => void;
  };

  clipboard: {
    readImage(): Promise<Uint8Array | null>;
    readText(): Promise<string | null>;
    /** `bytes` is an encoded image file (PNG/JPEG/…), not raw pixels — the context menu's
     * "Copy image" (§2.4). */
    writeImage(bytes: Uint8Array, mime: string): Promise<void>;
    /** A swatch's "Click copies the HEX" (§2.11, §4.2). */
    writeText(text: string): Promise<void>;
  };
}
