import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { DbRow, DbStatement, Platform } from '@/platform/types';
import { idbGet, idbSet, STORE_KV } from './idbStore';
import { logger } from '@/lib/logger';

const PERSIST_KEY = 'designspace.db';
const PERSIST_DEBOUNCE_MS = 500;

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
function getSql() {
  sqlPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

function toRow(columns: string[], values: SqlValue[]): DbRow {
  const row: DbRow = {};
  columns.forEach((col, i) => {
    const v = values[i];
    row[col] = v instanceof Uint8Array ? v : v === undefined ? null : v;
  });
  return row;
}

type DbClient = Platform['db'];

/** Wraps a sql.js in-memory Database, persisted (debounced) to IndexedDB. Same SQL and
 * migrations as TauriPlatform's rusqlite bridge run here — see §4.5. */
export class SqlJsDb implements DbClient {
  private db: Database | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    const SQL = await getSql();
    const saved = await idbGet<Uint8Array>(STORE_KV, PERSIST_KEY);
    this.db = new SQL.Database(saved);
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  private async db_(): Promise<Database> {
    await this.ready;
    if (!this.db) throw new Error('sql.js database failed to initialize');
    return this.db;
  }

  private schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistNow() {
    const db = await this.db_();
    try {
      await idbSet(STORE_KV, PERSIST_KEY, db.export());
    } catch (err) {
      logger.error('Failed to persist the browser database to IndexedDB', err);
    }
  }

  async select<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.db_();
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params as SqlValue[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(toRow(stmt.getColumnNames(), stmt.get()) as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    const db = await this.db_();
    db.run(sql, params as SqlValue[]);
    this.schedulePersist();
    return { changes: db.getRowsModified() };
  }

  async batch(statements: DbStatement[]): Promise<void> {
    const db = await this.db_();
    db.run('BEGIN;');
    try {
      for (const { sql, params } of statements) {
        db.run(sql, (params ?? []) as SqlValue[]);
      }
      db.run('COMMIT;');
    } catch (err) {
      db.run('ROLLBACK;');
      throw err;
    }
    this.schedulePersist();
  }

  /** Flushes pending writes immediately — call before the tab unloads. */
  async flush(): Promise<void> {
    clearTimeout(this.persistTimer);
    await this.persistNow();
  }

  /** Deletes the persisted database (used by tests and "reset library"). */
  async reset(): Promise<void> {
    const SQL = await getSql();
    this.db?.close();
    this.db = new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    await idbSet(STORE_KV, PERSIST_KEY, undefined);
  }
}
