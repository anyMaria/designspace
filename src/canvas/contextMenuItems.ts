import type { Item } from '@/state/types';
import { isMediaItem } from '@/lib/itemKinds';
import { noteColorNames, type NoteColor } from '@/design/tokens';

export type ContextMenuItemId =
  | 'copy-image'
  | 'add-favorite'
  | 'remove-favorite'
  | 'adjust-crop'
  | 'reset-crop'
  | 'show-in-explorer'
  | 'bring-to-front'
  | 'send-to-back'
  | 'tidy-up'
  | 'connect-to'
  | 'back-to-inbox'
  | 'make-palette'
  | 'combine-palette'
  | 'edit-palette'
  | 'copy-colors'
  | 'create-board'
  | 'remove-from-board'
  | 'make-type-collection'
  | 'add-to-type-collection'
  | 'remove-from-type-collection'
  | 'edit-note'
  | 'description-add'
  | 'description-edit'
  | `note-color-${NoteColor}`
  | 'move-to-trash';

const isMedia = (i: Item): boolean => isMediaItem(i);
const isFamily = (i: Item): boolean => i.kind === 'font' && !i.fontCollection;
const isCollection = (i: Item): boolean => i.kind === 'font' && !!i.fontCollection;

/** Which right-click entries make sense for what was clicked (Patch 1 · B6), in menu order. */
/** `cropped`: the single clicked picture has an owner's crop (Patch 2 · C3). */
export function contextMenuItemIds(
  items: Item[],
  ctx: { onBoard: boolean; cropped?: boolean; inCollection?: boolean },
): ContextMenuItemId[] {
  const ids: ContextMenuItemId[] = [];
  // Notes are written, not collected: a short menu of their own.
  if (items.length > 0 && items.every((i) => i.kind === 'note')) {
    if (items.length === 1) ids.push('edit-note');
    ids.push(...noteColorNames.map((c): ContextMenuItemId => `note-color-${c}`));
    ids.push('bring-to-front', 'send-to-back', 'move-to-trash');
    return ids;
  }
  if (items.length === 1 && items[0]?.kind === 'image') ids.push('copy-image');
  if (items.length === 1 && ctx.cropped) ids.push('adjust-crop', 'reset-crop');
  // Favourites: media items only (Patch 2 · C6).
  if (items.length > 0 && items.every(isMedia))
    ids.push(items.every((i) => i.favorite) ? 'remove-favorite' : 'add-favorite');
  if (items.length > 0 && items.every((i) => !!i.filePath)) ids.push('show-in-explorer');
  ids.push('bring-to-front', 'send-to-back');
  if (items.length >= 2) ids.push('tidy-up');
  if (items.length === 1) ids.push('connect-to');
  if (items.length > 0 && items.every(isMedia)) ids.push('back-to-inbox');
  // One photo with sampled colours: open it in the Color studio (Patch 2 · E7).
  if (items.length === 1 && items[0]?.kind === 'image' && (items[0].palette?.length ?? 0) > 0)
    ids.push('make-palette');
  // One media item: add or edit its long description (Patch 1 · E4).
  const only = items.length === 1 ? items[0] : null;
  if (only && isMediaItem(only))
    ids.push(only.descriptionText?.trim() ? 'description-edit' : 'description-add');
  const allSwatches = items.length > 0 && items.every((i) => i.kind === 'swatch');
  if (allSwatches && items.length >= 2) ids.push('combine-palette');
  if (allSwatches && items.length === 1) ids.push('edit-palette', 'copy-colors');
  // Type collections (Patch 2 · F5).
  if (items.length >= 2 && items.every(isFamily)) ids.push('make-type-collection');
  const collections = items.filter(isCollection);
  const families = items.filter(isFamily);
  if (
    collections.length === 1 &&
    families.length >= 1 &&
    collections.length + families.length === items.length
  ) {
    const have = collections[0].fontCollection?.ids ?? [];
    if (families.some((f) => !have.includes(f.id))) ids.push('add-to-type-collection');
  }
  if (items.length === 1 && ctx.inCollection) ids.push('remove-from-type-collection');
  ids.push('create-board');
  if (ctx.onBoard) ids.push('remove-from-board');
  ids.push('move-to-trash');
  return ids;
}
