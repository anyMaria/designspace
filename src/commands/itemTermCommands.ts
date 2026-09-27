import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { normalize } from '@/lib/normalize';
import { newId } from '@/lib/ids';
import type { Command } from './types';
import type { Facet } from '@/state/types';

/** Classification commands — §2.5, §2.6. Each is one undoable Command; "setting a Type or a
 * Vibe marks the item sorted" (the Inbox rule) is folded in here rather than layered on top,
 * since it's a direct consequence of the same write. */

/** Reuses an existing term (case/accent-insensitive) or creates one — §2.5 "Typing a new name
 * and pressing Enter offers 'Create x'". Not a Command itself; callers snapshot enough to undo
 * the term creation too (see `removeTermIfOrphaned`). */
async function findOrCreateTerm(
  platform: Platform,
  facet: Facet,
  name: string,
): Promise<{ id: string; created: boolean }> {
  const nameNorm = normalize(name);
  const existing = [...useTermStore.getState().terms.values()].find(
    (t) => t.facet === facet && t.nameNorm === nameNorm,
  );
  if (existing) return { id: existing.id, created: false };

  const id = newId();
  const now = new Date().toISOString();
  const sort = [...useTermStore.getState().terms.values()].filter((t) => t.facet === facet).length;
  useTermStore.getState().upsertTerm({
    id,
    facet,
    name,
    nameNorm,
    aiHint: null,
    sort,
    createdAt: now,
  });
  await platform.db.execute(
    'INSERT INTO terms (id, facet, name, name_norm, ai_hint, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, facet, name, nameNorm, null, sort, now],
  );
  return { id, created: true };
}

/** Deletes a term if no item links to it any more — the undo half of creating one on the fly. */
async function removeTermIfOrphaned(platform: Platform, termId: string): Promise<void> {
  const stillUsed = [...useTermStore.getState().itemTerms.values()].some((ids) => ids.has(termId));
  if (stillUsed) return;
  useTermStore.getState().removeTerms([termId]);
  await platform.db.execute('DELETE FROM terms WHERE id = ?', [termId]);
}

async function linkItemTerm(platform: Platform, itemId: string, termId: string): Promise<void> {
  useTermStore.getState().addItemTerm(itemId, termId);
  await platform.db.execute(
    'INSERT OR IGNORE INTO item_terms (item_id, term_id, via, added_at) VALUES (?, ?, ?, ?)',
    [itemId, termId, 'user', new Date().toISOString()],
  );
}

async function unlinkItemTerm(platform: Platform, itemId: string, termId: string): Promise<void> {
  useTermStore.getState().removeItemTerm(itemId, termId);
  await platform.db.execute('DELETE FROM item_terms WHERE item_id = ? AND term_id = ?', [
    itemId,
    termId,
  ]);
}

async function markSortedIfNeeded(platform: Platform, itemId: string): Promise<string | null> {
  const item = useLibraryStore.getState().items.get(itemId);
  if (!item || item.sortedAt) return null;
  const now = new Date().toISOString();
  useLibraryStore.getState().upsertItem({ ...item, sortedAt: now });
  await platform.db.execute('UPDATE items SET sorted_at = ? WHERE id = ?', [now, itemId]);
  return now;
}

async function unmarkSorted(platform: Platform, itemId: string): Promise<void> {
  const item = useLibraryStore.getState().items.get(itemId);
  if (!item) return;
  useLibraryStore.getState().upsertItem({ ...item, sortedAt: null });
  await platform.db.execute('UPDATE items SET sorted_at = NULL WHERE id = ?', [itemId]);
}

/** Type is single-choice (§2.5): replaces whatever Type term(s) the item had. Setting it marks
 * the item sorted (§2.5 Inbox rule). `term` is an existing id or a new name to create. */
export function createSetItemTypeCommand(
  platform: Platform,
  itemId: string,
  term: { id: string } | { name: string },
): Command {
  const previousTermIds = useTermStore.getState().itemTermIdsForFacet(itemId, 'type');
  const wasUnsorted = !useLibraryStore.getState().items.get(itemId)?.sortedAt;

  let resolvedId: string | null = null;
  let createdNew = false;

  async function doIt(): Promise<void> {
    const resolved =
      'id' in term
        ? { id: term.id, created: false }
        : await findOrCreateTerm(platform, 'type', term.name);
    resolvedId = resolved.id;
    createdNew = resolved.created;
    for (const id of previousTermIds) await unlinkItemTerm(platform, itemId, id);
    await linkItemTerm(platform, itemId, resolved.id);
    await markSortedIfNeeded(platform, itemId);
  }

  async function undoIt(): Promise<void> {
    if (resolvedId) {
      await unlinkItemTerm(platform, itemId, resolvedId);
      if (createdNew) await removeTermIfOrphaned(platform, resolvedId);
    }
    for (const id of previousTermIds) await linkItemTerm(platform, itemId, id);
    if (wasUnsorted) await unmarkSorted(platform, itemId);
  }

  return { label: 'Set Type', do: doIt, undo: undoIt };
}

/** Vibe/Movement/Tags are multi-select (§2.5): adds one term without touching the others. Vibe
 * also marks the item sorted, same as Type. */
export function createAddItemTermCommand(
  platform: Platform,
  itemId: string,
  facet: Facet,
  term: { id: string } | { name: string },
): Command {
  const wasUnsorted = !useLibraryStore.getState().items.get(itemId)?.sortedAt;
  let resolvedId: string | null = null;
  let createdNew = false;

  async function doIt(): Promise<void> {
    const resolved =
      'id' in term
        ? { id: term.id, created: false }
        : await findOrCreateTerm(platform, facet, term.name);
    resolvedId = resolved.id;
    createdNew = resolved.created;
    await linkItemTerm(platform, itemId, resolved.id);
    if (facet === 'vibe') await markSortedIfNeeded(platform, itemId);
  }

  async function undoIt(): Promise<void> {
    if (!resolvedId) return;
    await unlinkItemTerm(platform, itemId, resolvedId);
    if (createdNew) await removeTermIfOrphaned(platform, resolvedId);
    if (facet === 'vibe' && wasUnsorted) await unmarkSorted(platform, itemId);
  }

  return { label: `Add ${facet}`, do: doIt, undo: undoIt };
}

export function createRemoveItemTermCommand(
  platform: Platform,
  itemId: string,
  termId: string,
): Command {
  return {
    label: 'Remove tag',
    do: () => unlinkItemTerm(platform, itemId, termId),
    undo: () => linkItemTerm(platform, itemId, termId),
  };
}
