import type { DbStatement, Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { newId } from '@/lib/ids';
import { fontCollectionRows, fontCollectionSize } from '@/lib/fontCollection';
import { fontSpecimen } from '@/design/tokens';
import { en } from '@/i18n/en';
import type { Item, Placement } from '@/state/types';
import type { Command } from './types';

/** Type collections (Patch 2 · F5): a font item with no file whose `font_collection.ids` lists its
 * families, in order. On the space it sits on, each family's placement has `parent_id` = the
 * collection and a rect computed from the collection's. Every operation below is a snapshot
 * diff: the placements and the id list before and after, applied in one batch, so undo is exact. */

const FREED_GAP = 24; // world units under a collection where a removed family lands

interface Snap {
  collectionId: string;
  ids: string[];
  title: string | null; // null = leave the title alone
  placements: Placement[];
}

function placementsOf(ids: string[]): Placement[] {
  const all = useLibraryStore.getState().placements;
  return ids.map((id) => all.get(id)).filter((p): p is Placement => !!p);
}

/** Writes a snapshot to the store and the database. */
async function applySnap(platform: Platform, snap: Snap): Promise<void> {
  const store = useLibraryStore.getState();
  const item = store.items.get(snap.collectionId);
  const now = new Date().toISOString();
  const statements: DbStatement[] = [];
  if (item) {
    store.upsertItem({
      ...item,
      fontCollection: { ids: snap.ids },
      title: snap.title ?? item.title,
      updatedAt: now,
    });
  }
  statements.push({
    sql: 'UPDATE items SET font_collection = ?, title = COALESCE(?, title), updated_at = ? WHERE id = ?',
    params: [JSON.stringify({ ids: snap.ids }), snap.title, now, snap.collectionId],
  });
  for (const p of snap.placements) {
    store.upsertPlacement(p);
    statements.push({
      sql: `UPDATE placements SET x = ?, y = ?, w = ?, h = ?, z = ?, parent_id = ?
            WHERE board_id = ? AND item_id = ?`,
      params: [p.x, p.y, p.w, p.h, p.z, p.parentId, p.boardId, p.itemId],
    });
  }
  await platform.db.batch(statements);
}

/** The placements of a collection and its members after laying `ids` out as its rows. */
function layout(collection: Placement, ids: string[]): Placement[] {
  const size = fontCollectionSize(ids.length);
  const rows = fontCollectionRows(ids.length, collection);
  const members = placementsOf(ids).map((p) => ({ p, index: ids.indexOf(p.itemId) }));
  return [
    { ...collection, w: size.w, h: size.h },
    ...members.map(({ p, index }) => ({
      ...p,
      ...rows[index],
      z: collection.z,
      parentId: collection.itemId,
    })),
  ];
}

/** `before` and `after` for a change of `collectionId`'s family list. `released` are families that
 * leave and get their own card below the collection. */
function planChange(
  collectionId: string,
  nextIds: string[],
  titleAfter: string | null,
  released: string[] = [],
): { before: Snap; after: Snap } | null {
  const state = useLibraryStore.getState();
  const item = state.items.get(collectionId);
  const collection = state.placements.get(collectionId);
  if (!item?.fontCollection || !collection) return null;
  const currentIds = item.fontCollection.ids;
  const affected = [...new Set([...currentIds, ...nextIds, ...released])];
  const before: Snap = {
    collectionId,
    ids: currentIds,
    title: titleAfter === null ? null : item.title,
    placements: placementsOf([collectionId, ...affected]),
  };
  const laid = layout(collection, nextIds);
  const afterIds = new Set(laid.map((p) => p.itemId));
  const freed = placementsOf(released)
    .filter((p) => !afterIds.has(p.itemId))
    .map((p, i) => ({
      ...p,
      parentId: null,
      x: collection.x,
      y:
        collection.y +
        fontCollectionSize(nextIds.length).h +
        FREED_GAP +
        i * (fontSpecimen.height + FREED_GAP),
      w: fontSpecimen.width,
      h: fontSpecimen.height,
    }));
  return {
    before,
    after: { collectionId, ids: nextIds, title: titleAfter, placements: [...laid, ...freed] },
  };
}

function snapCommand(
  platform: Platform,
  label: string,
  plan: { before: Snap; after: Snap } | null,
): Command {
  return {
    label,
    do: () => (plan ? applySnap(platform, plan.after) : undefined),
    undo: () => (plan ? applySnap(platform, plan.before) : undefined),
  };
}

export function createAddToFontCollectionCommand(
  platform: Platform,
  collectionId: string,
  familyIds: string[],
): Command {
  const item = useLibraryStore.getState().items.get(collectionId);
  const have = item?.fontCollection?.ids ?? [];
  const next = [...have, ...familyIds.filter((id) => !have.includes(id))];
  return snapCommand(platform, 'Add to type collection', planChange(collectionId, next, null));
}

export function createRemoveFromFontCollectionCommand(
  platform: Platform,
  collectionId: string,
  familyId: string,
): Command {
  const have = useLibraryStore.getState().items.get(collectionId)?.fontCollection?.ids ?? [];
  return snapCommand(
    platform,
    'Remove from type collection',
    planChange(
      collectionId,
      have.filter((id) => id !== familyId),
      null,
      [familyId],
    ),
  );
}

export function createReorderFontCollectionCommand(
  platform: Platform,
  collectionId: string,
  orderedIds: string[],
): Command {
  return snapCommand(
    platform,
    'Reorder type collection',
    planChange(collectionId, orderedIds, null),
  );
}

export function createRenameFontCollectionCommand(
  platform: Platform,
  collectionId: string,
  title: string,
): Command {
  const have = useLibraryStore.getState().items.get(collectionId)?.fontCollection?.ids ?? [];
  return snapCommand(
    platform,
    'Rename type collection',
    planChange(collectionId, have, title.trim() || en.fontCollection.defaultName),
  );
}

/** Frees the members of collections that are about to be trashed (their cards go in a column under
 * the collection) and re-attaches them on undo. Used by `createTrashCommand`. */
export function planFreeMembers(collectionIds: string[]): { before: Snap; after: Snap }[] {
  const plans: { before: Snap; after: Snap }[] = [];
  for (const id of collectionIds) {
    const have = useLibraryStore.getState().items.get(id)?.fontCollection?.ids ?? [];
    const plan = planChange(id, [], null, have);
    if (plan) {
      // The collection itself keeps its list so that a restore from the Trash shows it intact.
      plan.after.ids = have;
      plans.push(plan);
    }
  }
  return plans;
}

export function applyFreeMembers(
  platform: Platform,
  plans: { before: Snap; after: Snap }[],
  which: 'before' | 'after',
): Promise<void[]> {
  return Promise.all(plans.map((p) => applySnap(platform, p[which])));
}

/** "Make a type collection": the selected families become the rows of a new collection placed
 * where the first one was. One undo step (the item, its placement and the members' new rects). */
export function createMakeFontCollectionCommand(
  platform: Platform,
  familyIds: string[],
): { command: Command; id: string } | null {
  const state = useLibraryStore.getState();
  const first = state.placements.get(familyIds[0]);
  if (!first) return null;
  const members = familyIds.filter((id) => state.placements.has(id));
  if (members.length < 2) return null;
  const now = new Date().toISOString();
  const id = newId();
  const size = fontCollectionSize(members.length);
  const z = Math.max(...[...state.placements.values()].map((p) => p.z), -1) + 1;
  const item: Item = {
    id,
    kind: 'font',
    title: en.fontCollection.defaultName,
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: now, // a collection is never in the Inbox
    viewedAt: null,
    status: 'ok',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    fontCollection: { ids: members },
  };
  const placement: Placement = {
    boardId: first.boardId,
    itemId: id,
    x: first.x,
    y: first.y,
    w: size.w,
    h: size.h,
    z,
    frameId: null,
    cropX: null,
    cropY: null,
    parentId: null,
    addedAt: now,
  };
  const before = placementsOf(members);
  const rows = fontCollectionRows(members.length, placement);
  const after = before.map((p) => ({
    ...p,
    ...rows[members.indexOf(p.itemId)],
    z,
    parentId: id,
  }));

  const command: Command = {
    label: 'Make a type collection',
    do: async () => {
      const store = useLibraryStore.getState();
      store.upsertItem(item);
      store.upsertPlacement(placement);
      await platform.db.batch([
        {
          sql: `INSERT INTO items (id, kind, title, status, derived_v, sorted_at, font_collection, created_at, updated_at)
                VALUES (?, 'font', ?, 'ok', 0, ?, ?, ?, ?)`,
          params: [id, item.title, now, JSON.stringify({ ids: members }), now, now],
        },
        {
          sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [placement.boardId, id, placement.x, placement.y, size.w, size.h, z, now],
        },
      ]);
      await applySnap(platform, { collectionId: id, ids: members, title: null, placements: after });
    },
    undo: async () => {
      // Members go back to where they were, then the collection is deleted (rows cascade).
      const store = useLibraryStore.getState();
      for (const p of before) store.upsertPlacement(p);
      store.removeItems([id]);
      await platform.db.batch([
        ...before.map((p) => ({
          sql: `UPDATE placements SET x = ?, y = ?, w = ?, h = ?, z = ?, parent_id = NULL
                WHERE board_id = ? AND item_id = ?`,
          params: [p.x, p.y, p.w, p.h, p.z, p.boardId, p.itemId],
        })),
        { sql: 'DELETE FROM items WHERE id = ?', params: [id] },
      ]);
    },
  };
  return { command, id };
}
