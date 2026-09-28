import type { DbRow, Platform } from '@/platform/types';

/** §2.5/§4.10's "Values already assigned or dismissed are excluded" — `ai_dismissed`
 * (`src/db/migrations/001_init.sql`). Not a `Command`: dismissing a suggestion is a standing
 * preference, not a content edit the owner would expect Ctrl+Z to walk back — the same choice
 * DECISIONS.md already made for "Set as cover" and "Extract palette". */

export async function loadDismissedTermIds(
  platform: Platform,
  itemId: string,
): Promise<Set<string>> {
  const rows = await platform.db.select<DbRow & { term_id: string }>(
    'SELECT term_id FROM ai_dismissed WHERE item_id = ?',
    [itemId],
  );
  return new Set(rows.map((r) => r.term_id));
}

export async function dismissSuggestion(
  platform: Platform,
  itemId: string,
  termId: string,
): Promise<void> {
  await platform.db.execute('INSERT OR IGNORE INTO ai_dismissed (item_id, term_id) VALUES (?, ?)', [
    itemId,
    termId,
  ]);
}
