import type { DbStatement, Platform } from '@/platform/types';
import { newId } from '@/lib/ids';
import { normalize } from '@/lib/normalize';
import {
  STARTER_MOVEMENTS,
  STARTER_TYPES,
  STARTER_VIBES,
  type VocabularyEntry,
} from '@/lib/vocabulary';
import type { Facet } from './types';

const STARTER_FACETS: [Facet, VocabularyEntry[]][] = [
  ['type', STARTER_TYPES],
  ['vibe', STARTER_VIBES],
  ['movement', STARTER_MOVEMENTS],
];

/** Seeds Type/Vibe/Movement from Appendix A on a fresh library — idempotent, like
 * `seedDemoLibrary` (§2.5: "Type, Vibe and Movement start with editable lists"; Tags start
 * empty). Call once at startup after the library is open. */
export async function seedVocabulary(platform: Platform): Promise<void> {
  const [{ count }] = await platform.db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM terms',
  );
  if (count > 0) return;

  const now = new Date().toISOString();
  const statements: DbStatement[] = [];
  for (const [facet, entries] of STARTER_FACETS) {
    entries.forEach((entry, sort) => {
      statements.push({
        sql: 'INSERT INTO terms (id, facet, name, name_norm, ai_hint, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [
          newId(),
          facet,
          entry.name,
          normalize(entry.name),
          entry.aiHint ?? null,
          sort,
          now,
        ],
      });
    });
  }
  await platform.db.batch(statements);
}
