// Real SQLite (sql.js) in memory, with the app's migrations applied up to `upTo`.
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { migrations, splitStatements } from '@/db/migrator';

export async function migratedDb(upTo = Infinity): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(process.cwd(), 'node_modules/sql.js/dist', f),
  });
  const db = new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  for (const m of migrations.filter((x) => x.version <= upTo))
    for (const stmt of splitStatements(m.sql)) db.run(stmt);
  return db;
}
