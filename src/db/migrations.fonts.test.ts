// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { migratedDb } from '@/test/migratedDb';
import { migrations, splitStatements } from './migrator';

const NOW = '2026-10-04T00:00:00.000Z';

describe('migration 005 (fonts)', () => {
  it('gives every existing font item one font_files row, and leaves other kinds alone', async () => {
    const db = await migratedDb(4);
    const meta = JSON.stringify({
      subfamily: 'Bold',
      variableAxes: [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }],
    });
    db.run(
      `INSERT INTO items (id, kind, title, file_path, file_name, file_hash, file_size, mime, font_meta, status, created_at, updated_at)
       VALUES ('f1','font','Urbanist','originals/f1.ttf','Urbanist.ttf','h1',100,'font/ttf',?, 'ok', ?, ?)`,
      [meta, NOW, NOW],
    );
    db.run(
      "INSERT INTO items (id, kind, title, status, created_at, updated_at) VALUES ('p1','image','x','ok',?,?)",
      [NOW, NOW],
    );
    const m = migrations.find((x) => x.version === 5);
    if (!m) throw new Error('no migration 5');
    for (const stmt of splitStatements(m.sql)) db.run(stmt);

    const rows = db.exec(
      'SELECT id, item_id, file_path, style_name, axes FROM font_files ORDER BY id',
    )[0].values;
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe('f1');
    expect(rows[0][2]).toBe('originals/f1.ttf');
    expect(rows[0][3]).toBe('Bold');
    expect(JSON.parse(String(rows[0][4]))[0].tag).toBe('wght');
    // The new columns exist and start empty.
    const item = db.exec(
      "SELECT font_family_key, font_card, font_collection FROM items WHERE id='f1'",
    )[0].values[0];
    expect(item).toEqual([null, null, null]);
    expect(db.exec('SELECT parent_id FROM placements LIMIT 1')).toEqual([]);
  });
});
