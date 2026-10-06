import type { DbStatement, Platform } from '@/platform/types';
import { useTermStore } from '@/state/termStore';
import type { Command } from './types';
import { normalize } from '@/lib/normalize';
import type { Facet } from '@/state/types';

/** Settings → Vocabularies (§2.5): rename, merge, delete, reorder edits, each one
 * undoable Command. */

export function createRenameTermCommand(platform: Platform, id: string, name: string): Command {
  const previous = useTermStore.getState().terms.get(id);
  const nameNorm = normalize(name);

  async function apply(newName: string, newNameNorm: string): Promise<void> {
    const term = useTermStore.getState().terms.get(id);
    if (!term) return;
    useTermStore.getState().upsertTerm({ ...term, name: newName, nameNorm: newNameNorm });
    await platform.db.execute('UPDATE terms SET name = ?, name_norm = ? WHERE id = ?', [
      newName,
      newNameNorm,
      id,
    ]);
  }

  return {
    label: `Rename "${previous?.name ?? id}"`,
    do: () => apply(name, nameNorm),
    undo: () => (previous ? apply(previous.name, previous.nameNorm) : undefined),
  };
}

/** Deletes a term and every item's link to it — confirmed in the UI first (§2.5 "asks first,
 * undoable"). Snapshots the term row and its item links so undo restores both exactly. */
export function createDeleteTermCommand(platform: Platform, id: string): Command {
  const term = useTermStore.getState().terms.get(id);
  const itemIds = [...useTermStore.getState().itemTerms.entries()]
    .filter(([, termIds]) => termIds.has(id))
    .map(([itemId]) => itemId);

  async function doIt(): Promise<void> {
    useTermStore.getState().removeTerms([id]);
    await platform.db.batch([
      { sql: 'DELETE FROM item_terms WHERE term_id = ?', params: [id] },
      { sql: 'DELETE FROM terms WHERE id = ?', params: [id] },
    ]);
  }

  async function undoIt(): Promise<void> {
    if (!term) return;
    useTermStore.getState().upsertTerm(term);
    for (const itemId of itemIds) useTermStore.getState().addItemTerm(itemId, id);

    const now = new Date().toISOString();
    const statements: DbStatement[] = [
      {
        sql: 'INSERT INTO terms (id, facet, name, name_norm, ai_hint, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [
          term.id,
          term.facet,
          term.name,
          term.nameNorm,
          term.aiHint,
          term.sort,
          term.createdAt,
        ],
      },
      ...itemIds.map((itemId) => ({
        sql: 'INSERT INTO item_terms (item_id, term_id, via, added_at) VALUES (?, ?, ?, ?)',
        params: [itemId, id, 'user', now],
      })),
    ];
    await platform.db.batch(statements);
  }

  return {
    label: `Delete "${term?.name ?? id}"`,
    do: doIt,
    undo: undoIt,
  };
}

/** Moves every item from `sourceId` to `targetId` (same facet) and deletes the source term —
 * §2.5 "merge (items move to the target value)". Only items that don't already carry the target
 * are repointed; undo restores the source term and its exact original links, and removes only
 * the target links the merge itself created. */
export function createMergeTermsCommand(
  platform: Platform,
  sourceId: string,
  targetId: string,
): Command {
  const source = useTermStore.getState().terms.get(sourceId);
  const target = useTermStore.getState().terms.get(targetId);
  const itemTerms = useTermStore.getState().itemTerms;
  const sourceItemIds = [...itemTerms.entries()]
    .filter(([, ids]) => ids.has(sourceId))
    .map(([itemId]) => itemId);
  const targetItemIdsBefore = new Set(
    [...itemTerms.entries()].filter(([, ids]) => ids.has(targetId)).map(([itemId]) => itemId),
  );
  const repointedItemIds = sourceItemIds.filter((id) => !targetItemIdsBefore.has(id));

  async function doIt(): Promise<void> {
    if (!source || !target) return;
    useTermStore.getState().removeTerms([sourceId]);
    for (const itemId of repointedItemIds) useTermStore.getState().addItemTerm(itemId, targetId);

    const now = new Date().toISOString();
    const statements: DbStatement[] = [
      { sql: 'DELETE FROM item_terms WHERE term_id = ?', params: [sourceId] },
      { sql: 'DELETE FROM terms WHERE id = ?', params: [sourceId] },
      ...repointedItemIds.map((itemId) => ({
        sql: 'INSERT OR IGNORE INTO item_terms (item_id, term_id, via, added_at) VALUES (?, ?, ?, ?)',
        params: [itemId, targetId, 'user', now],
      })),
    ];
    await platform.db.batch(statements);
  }

  async function undoIt(): Promise<void> {
    if (!source) return;
    useTermStore.getState().upsertTerm(source);
    for (const itemId of repointedItemIds) useTermStore.getState().removeItemTerm(itemId, targetId);
    for (const itemId of sourceItemIds) useTermStore.getState().addItemTerm(itemId, sourceId);

    const now = new Date().toISOString();
    const statements: DbStatement[] = [
      {
        sql: 'INSERT INTO terms (id, facet, name, name_norm, ai_hint, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [
          source.id,
          source.facet,
          source.name,
          source.nameNorm,
          source.aiHint,
          source.sort,
          source.createdAt,
        ],
      },
      ...repointedItemIds.map((itemId) => ({
        sql: 'DELETE FROM item_terms WHERE item_id = ? AND term_id = ?',
        params: [itemId, targetId],
      })),
      ...sourceItemIds.map((itemId) => ({
        sql: 'INSERT INTO item_terms (item_id, term_id, via, added_at) VALUES (?, ?, ?, ?)',
        params: [itemId, sourceId, 'user', now],
      })),
    ];
    await platform.db.batch(statements);
  }

  return {
    label: `Merge "${source?.name ?? sourceId}" into "${target?.name ?? targetId}"`,
    do: doIt,
    undo: undoIt,
  };
}

/** Sets `sort` for every term in `orderedIds` to its index — reordering the vocabulary manager's
 * list, which is also the 1–9 order Triage assigns to Type (§2.5, §2.7). */
export function createReorderTermsCommand(
  platform: Platform,
  facet: Facet,
  orderedIds: string[],
): Command {
  const previousOrder = [...useTermStore.getState().terms.values()]
    .filter((t) => t.facet === facet)
    .sort((a, b) => a.sort - b.sort)
    .map((t) => t.id);

  async function apply(ids: string[]): Promise<void> {
    const statements: DbStatement[] = [];
    ids.forEach((id, sort) => {
      const term = useTermStore.getState().terms.get(id);
      if (!term) return;
      useTermStore.getState().upsertTerm({ ...term, sort });
      statements.push({ sql: 'UPDATE terms SET sort = ? WHERE id = ?', params: [sort, id] });
    });
    await platform.db.batch(statements);
  }

  return {
    label: `Reorder ${facet}`,
    do: () => apply(orderedIds),
    undo: () => apply(previousOrder),
  };
}

/** Moves a word to another field (Patch 2 · D3), e.g. a mood that was filed under Movement goes to
 * Vibe, keeping its items and AI hint. If the target field already has a word with the same name,
 * the two are merged instead (items move to the existing word). A Type can't be moved (an item has
 * one Type); the UI never offers it. */
export function createMoveTermCommand(
  platform: Platform,
  termId: string,
  toFacet: 'vibe' | 'movement' | 'tag',
): Command {
  const terms = useTermStore.getState().terms;
  const term = terms.get(termId);
  const existing = term
    ? [...terms.values()].find((t) => t.facet === toFacet && t.nameNorm === term.nameNorm)
    : undefined;
  if (existing) return createMergeTermsCommand(platform, termId, existing.id);

  const previous = term ? { facet: term.facet, sort: term.sort } : null;
  const nextSort =
    1 + Math.max(-1, ...[...terms.values()].filter((t) => t.facet === toFacet).map((t) => t.sort));

  async function apply(facet: Facet, sort: number): Promise<void> {
    const current = useTermStore.getState().terms.get(termId);
    if (!current) return;
    useTermStore.getState().upsertTerm({ ...current, facet, sort });
    await platform.db.execute('UPDATE terms SET facet = ?, sort = ? WHERE id = ?', [
      facet,
      sort,
      termId,
    ]);
  }

  return {
    label: `Move "${term?.name ?? termId}" to ${toFacet}`,
    do: () => apply(toFacet, nextSort),
    undo: () => (previous ? apply(previous.facet, previous.sort) : undefined),
  };
}
