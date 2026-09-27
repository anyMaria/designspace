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

/** Bulk Details panel (§2.6 "Several items selected"): the same Type/Vibe/Movement/Tags
 * mutations as above, applied to every selected item as one undo step. */

export function createBulkSetTypeCommand(
  platform: Platform,
  itemIds: string[],
  term: { id: string } | { name: string },
): Command {
  const perItem = itemIds.map((itemId) => ({
    itemId,
    previousTermIds: useTermStore.getState().itemTermIdsForFacet(itemId, 'type'),
    wasUnsorted: !useLibraryStore.getState().items.get(itemId)?.sortedAt,
  }));
  let resolvedId: string | null = null;
  let createdNew = false;

  async function doIt(): Promise<void> {
    const resolved =
      'id' in term
        ? { id: term.id, created: false }
        : await findOrCreateTerm(platform, 'type', term.name);
    resolvedId = resolved.id;
    createdNew = resolved.created;
    for (const { itemId, previousTermIds } of perItem) {
      for (const id of previousTermIds) await unlinkItemTerm(platform, itemId, id);
      await linkItemTerm(platform, itemId, resolved.id);
      await markSortedIfNeeded(platform, itemId);
    }
  }

  async function undoIt(): Promise<void> {
    for (const { itemId, previousTermIds, wasUnsorted } of perItem) {
      if (resolvedId) await unlinkItemTerm(platform, itemId, resolvedId);
      for (const id of previousTermIds) await linkItemTerm(platform, itemId, id);
      if (wasUnsorted) await unmarkSorted(platform, itemId);
    }
    if (resolvedId && createdNew) await removeTermIfOrphaned(platform, resolvedId);
  }

  return { label: `Set Type (${itemIds.length})`, do: doIt, undo: undoIt };
}

/** "Clicking a partial chip applies it to all" (§2.6) — only links items that don't already have
 * it, and undo only unlinks exactly those, so an item that already carried the value keeps it. */
export function createBulkAddTermCommand(
  platform: Platform,
  itemIds: string[],
  facet: Facet,
  term: { id: string } | { name: string },
): Command {
  const wasUnsortedByItem = new Map(
    itemIds.map((id) => [id, !useLibraryStore.getState().items.get(id)?.sortedAt]),
  );
  const alreadyHadByItem = new Map<string, boolean>();
  let resolvedId: string | null = null;
  let createdNew = false;

  async function doIt(): Promise<void> {
    const resolved =
      'id' in term
        ? { id: term.id, created: false }
        : await findOrCreateTerm(platform, facet, term.name);
    resolvedId = resolved.id;
    createdNew = resolved.created;
    for (const itemId of itemIds) {
      const had = useTermStore.getState().itemTerms.get(itemId)?.has(resolved.id) ?? false;
      alreadyHadByItem.set(itemId, had);
      if (!had) {
        await linkItemTerm(platform, itemId, resolved.id);
        if (facet === 'vibe') await markSortedIfNeeded(platform, itemId);
      }
    }
  }

  async function undoIt(): Promise<void> {
    if (!resolvedId) return;
    for (const itemId of itemIds) {
      if (!alreadyHadByItem.get(itemId)) {
        await unlinkItemTerm(platform, itemId, resolvedId);
        if (facet === 'vibe' && wasUnsortedByItem.get(itemId)) await unmarkSorted(platform, itemId);
      }
    }
    if (createdNew) await removeTermIfOrphaned(platform, resolvedId);
  }

  return { label: `Add ${facet} (${itemIds.length})`, do: doIt, undo: undoIt };
}

/** "× removes it from all" (§2.6) — only the items that actually had the term are touched. */
export function createBulkRemoveTermCommand(
  platform: Platform,
  itemIds: string[],
  termId: string,
): Command {
  let hadIds: string[] = [];

  async function doIt(): Promise<void> {
    hadIds = itemIds.filter((id) => useTermStore.getState().itemTerms.get(id)?.has(termId));
    for (const id of hadIds) await unlinkItemTerm(platform, id, termId);
  }

  async function undoIt(): Promise<void> {
    for (const id of hadIds) await linkItemTerm(platform, id, termId);
  }

  return { label: `Remove tag (${itemIds.length})`, do: doIt, undo: undoIt };
}

/** "Back to Inbox" (§2.5 Inbox rule, context menu) — clears `sorted_at` so the item(s) reappear
 * in the Inbox; undo restores whatever `sorted_at` they had before. */
export function createBackToInboxCommand(platform: Platform, itemIds: string[]): Command {
  const previous = itemIds.map((id) => ({
    id,
    sortedAt: useLibraryStore.getState().items.get(id)?.sortedAt ?? null,
  }));

  async function apply(values: { id: string; sortedAt: string | null }[]): Promise<void> {
    const statements = [];
    for (const v of values) {
      const item = useLibraryStore.getState().items.get(v.id);
      if (!item) continue;
      useLibraryStore.getState().upsertItem({ ...item, sortedAt: v.sortedAt });
      statements.push({
        sql: 'UPDATE items SET sorted_at = ? WHERE id = ?',
        params: [v.sortedAt, v.id],
      });
    }
    await platform.db.batch(statements);
  }

  return {
    label: itemIds.length > 1 ? `Back to Inbox (${itemIds.length})` : 'Back to Inbox',
    do: () => apply(itemIds.map((id) => ({ id, sortedAt: null }))),
    undo: () => apply(previous),
  };
}
