import type { Platform } from '@/platform/types';
import migration001 from './migrations/001_init.sql?raw';
import migration002 from './migrations/002_patch1.sql?raw';
import migration003 from './migrations/003_crop.sql?raw';
import migration004 from './migrations/004_vocabulary.sql?raw';
import migration005 from './migrations/005_fonts.sql?raw';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Add new migrations here, in order, as `src/db/migrations/NNN_name.sql` — never edit a
// shipped one (CLAUDE.md "Migrations only", plan §5.3).
export const migrations: Migration[] = [
  { version: 1, name: 'init', sql: migration001 },
  { version: 2, name: 'patch1', sql: migration002 },
  { version: 3, name: 'crop', sql: migration003 },
  { version: 4, name: 'vocabulary', sql: migration004 },
  { version: 5, name: 'fonts', sql: migration005 },
];

export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((m) => m.version));

/**
 * Splits a `.sql` file into individual statements. Strips `--` line comments and splits on `;`
 * outside single/double-quoted strings. Good enough for our DDL, which never has a literal
 * semicolon inside a string.
 */
export function splitStatements(sql: string): string[] {
  let inLineComment = false;
  let inSingle = false;
  let inDouble = false;
  let current = '';
  const statements: string[] = [];

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      else continue;
      current += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;

    if (!inSingle && !inDouble && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

async function tableExists(db: Platform['db'], table: string): Promise<boolean> {
  const rows = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );
  return rows.length > 0;
}

/** The database's current `schema_version` (0 for a brand-new, empty database). */
export async function readSchemaVersion(db: Platform['db']): Promise<number> {
  if (!(await tableExists(db, 'meta'))) return 0;
  const rows = await db.select<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'schema_version'",
    [],
  );
  return rows.length > 0 ? Number(rows[0].value) : 0;
}

/** Runs every migration newer than the database's current schema_version, each in one transaction. */
export async function runMigrations(db: Platform['db']): Promise<{ from: number; to: number }> {
  const from = await readSchemaVersion(db);
  const pending = migrations.filter((m) => m.version > from).sort((a, b) => a.version - b.version);

  let version = from;
  for (const migration of pending) {
    const statements: { sql: string; params?: unknown[] }[] = splitStatements(migration.sql).map(
      (sql) => ({ sql }),
    );
    statements.push({
      sql:
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [String(migration.version)],
    });
    await db.batch(statements);
    version = migration.version;
  }
  return { from, to: version };
}
