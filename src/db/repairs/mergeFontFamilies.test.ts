// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { migratedDb } from '@/test/migratedDb';
import { mergeStatements, planFontMerge, type MergeItemRow } from './mergeFontFamilies';

const c = (id: string, key: string, createdAt: string, vendorId: string | null = null) => ({
  id,
  familyKey: key,
  vendorId,
  createdAt,
});

describe('planFontMerge', () => {
  it('two Urbanist + one Inter → one group, the oldest kept', () => {
    const plan = planFontMerge([
      c('b', 'urbanist', '2026-02-01'),
      c('a', 'urbanist', '2026-01-01'),
      c('i', 'inter', '2026-01-01'),
    ]);
    expect(plan).toEqual([{ keptId: 'a', mergedIds: ['b'] }]);
  });
  it('different real vendor ids → no merge; a missing vendor id still merges', () => {
    expect(planFontMerge([c('a', 'x', '1', 'AAAA'), c('b', 'x', '2', 'BBBB')])).toEqual([]);
    expect(planFontMerge([c('a', 'x', '1', 'AAAA'), c('b', 'x', '2', null)])).toEqual([
      { keptId: 'a', mergedIds: ['b'] },
    ]);
  });
  it('ignores items without a key', () => {
    expect(planFontMerge([c('a', '', '1'), c('b', '', '2')])).toEqual([]);
  });
});

const NOW = '2026-10-04T00:00:00.000Z';

function row(
  db: Database,
  id: string,
  over: { title?: string; favorite?: number; why?: string | null } = {},
) {
  db.run(
    `INSERT INTO items (id, kind, title, file_name, file_path, file_hash, favorite, why, artist, sorted_at, viewed_at, status, created_at, updated_at)
     VALUES (?, 'font', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)`,
    [
      id,
      over.title ?? id,
      `${id}.ttf`,
      `o/${id}.ttf`,
      `h-${id}`,
      over.favorite ?? 0,
      over.why ?? null,
      null,
      null,
      null,
      NOW,
      NOW,
    ],
  );
  db.run(
    'INSERT INTO font_files (id, item_id, file_path, file_name, file_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, id, `o/${id}.ttf`, `${id}.ttf`, `h-${id}`, NOW],
  );
}
const asRow = (id: string, over: Partial<MergeItemRow> = {}): MergeItemRow => ({
  id,
  title: id,
  fileName: `${id}.ttf`,
  favorite: false,
  why: null,
  description: null,
  descriptionText: null,
  artist: null,
  sortedAt: null,
  viewedAt: null,
  ...over,
});
const q = (db: Database, sql: string) => db.exec(sql)[0]?.values ?? [];

describe('mergeStatements', () => {
  it('moves files, unions terms, re-points connections and placements, and removes merged rows', async () => {
    const db = await migratedDb();
    for (const id of ['k', 'm', 'x', 'y'])
      row(db, id, id === 'm' ? { favorite: 1, why: 'because' } : {});
    db.run(
      "INSERT INTO boards (id, name, kind, created_at, updated_at) VALUES ('lib','Library','library',?,?),('b2','B2','board',?,?)",
      [NOW, NOW, NOW, NOW],
    );
    for (const [t, name] of [
      ['t1', 'A'],
      ['t2', 'B'],
    ])
      db.run(
        "INSERT INTO terms (id, facet, name, name_norm, sort, created_at) VALUES (?, 'vibe', ?, ?, 0, ?)",
        [t, name, name, NOW],
      );
    db.run(
      "INSERT INTO item_terms VALUES ('k','t1','user',?),('m','t1','user',?),('m','t2','user',?)",
      [NOW, NOW, NOW],
    );
    // Connections: m→x (kept has none), y→m, plus k→x and x→k already (duplicates in either direction), and k–m itself.
    db.run(
      "INSERT INTO manual_connections (id, from_id, to_id, created_at) VALUES ('c1','m','x',?),('c2','y','m',?),('c3','k','y',?),('c4','m','k',?)",
      [NOW, NOW, NOW, NOW],
    );
    // Placements: both on lib (kept's wins), only m on b2 (moves).
    const pl = (b: string, i: string) =>
      db.run(
        'INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at) VALUES (?, ?, 0, 0, 1, 1, 0, ?)',
        [b, i, NOW],
      );
    pl('lib', 'k');
    pl('lib', 'm');
    pl('b2', 'm');

    for (const s of mergeStatements(
      asRow('k'),
      [asRow('m', { favorite: true, why: 'because' })],
      'Fam',
    ))
      db.run(s.sql, s.params as never);

    expect(q(db, 'SELECT id FROM items ORDER BY id').flat()).toEqual(['k', 'x', 'y']);
    expect(q(db, "SELECT item_id FROM font_files WHERE id = 'm'")).toEqual([['k']]);
    expect(
      q(db, "SELECT term_id FROM item_terms WHERE item_id = 'k' ORDER BY term_id").flat(),
    ).toEqual(['t1', 't2']);
    // c1 (m→x) re-pointed to k→x; c2 (y→m) would duplicate c3 (k→y) in the other direction → dropped; c4 (m–k) dropped.
    expect(q(db, 'SELECT from_id, to_id FROM manual_connections ORDER BY id')).toEqual([
      ['k', 'x'],
      ['k', 'y'],
    ]);
    expect(
      q(db, "SELECT board_id FROM placements WHERE item_id = 'k' ORDER BY board_id").flat(),
    ).toEqual(['b2', 'lib']);
    expect(q(db, "SELECT favorite, why, title, derived_v FROM items WHERE id = 'k'")).toEqual([
      [1, 'because', 'Fam', 0],
    ]);
  });

  it('keeps a title the owner changed', async () => {
    const db = await migratedDb();
    row(db, 'k', { title: 'My favourite' });
    row(db, 'm');
    for (const s of mergeStatements(asRow('k', { title: 'My favourite' }), [asRow('m')], 'Fam'))
      db.run(s.sql, s.params as never);
    expect(q(db, "SELECT title FROM items WHERE id = 'k'")).toEqual([['My favourite']]);
  });
});
