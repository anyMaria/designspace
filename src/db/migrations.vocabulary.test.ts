// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { migratedDb } from '@/test/migratedDb';
import { migrations, splitStatements } from './migrator';

const NOW = '2026-10-04T00:00:00.000Z';

async function dbAtV3() {
  const db = await migratedDb(3);
  db.run(
    "INSERT INTO items (id, kind, title, status, created_at, updated_at) VALUES ('i1','image','x','ok',?,?)",
    [NOW, NOW],
  );
  return db;
}

function addTerm(
  db: Awaited<ReturnType<typeof migratedDb>>,
  id: string,
  facet: string,
  name: string,
) {
  db.run(
    'INSERT INTO terms (id, facet, name, name_norm, ai_hint, sort, created_at) VALUES (?,?,?,?,?,0,?)',
    [id, facet, name, name.toLowerCase(), 'hint', NOW],
  );
}

function runMigration4(db: Awaited<ReturnType<typeof migratedDb>>) {
  const m = migrations.find((x) => x.version === 4);
  if (!m) throw new Error('migration 4 missing');
  for (const stmt of splitStatements(m.sql)) db.run(stmt);
}

describe('004_vocabulary.sql', () => {
  it('moves a mood from Movement to Vibe, keeping its items and hint, and drops an unused Contemporary', async () => {
    const db = await dbAtV3();
    addTerm(db, 'grunge', 'movement', 'Grunge');
    addTerm(db, 'contemporary', 'movement', 'Contemporary');
    db.run(
      "INSERT INTO item_terms (item_id, term_id, via, added_at) VALUES ('i1','grunge','user',?)",
      [NOW],
    );

    runMigration4(db);

    const grunge = db.exec("SELECT facet, ai_hint FROM terms WHERE id = 'grunge'")[0].values[0];
    expect(grunge).toEqual(['vibe', 'hint']);
    expect(
      db.exec("SELECT COUNT(*) FROM item_terms WHERE term_id = 'grunge'")[0].values[0][0],
    ).toBe(1);
    expect(db.exec("SELECT COUNT(*) FROM terms WHERE id = 'contemporary'")[0].values[0][0]).toBe(0);
  });

  it('keeps Contemporary when an item uses it, and leaves a word alone when a Vibe of that name exists', async () => {
    const db = await dbAtV3();
    addTerm(db, 'contemporary', 'movement', 'Contemporary');
    db.run(
      "INSERT INTO item_terms (item_id, term_id, via, added_at) VALUES ('i1','contemporary','user',?)",
      [NOW],
    );
    addTerm(db, 'punk-m', 'movement', 'Punk');
    addTerm(db, 'punk-v', 'vibe', 'Punk');

    runMigration4(db);

    expect(db.exec("SELECT COUNT(*) FROM terms WHERE id = 'contemporary'")[0].values[0][0]).toBe(1);
    expect(db.exec("SELECT facet FROM terms WHERE id = 'punk-m'")[0].values[0][0]).toBe('movement');
  });
});
