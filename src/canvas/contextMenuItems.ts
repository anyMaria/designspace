import type { Item } from '@/state/types';
import { isMediaKind } from '@/lib/itemKinds';
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
  | 'extract-palette'
  | 'combine-palette'
  | 'edit-palette'
  | 'copy-colors'
  | 'create-board'
  | 'remove-from-board'
  | 'edit-note'
  | 'description-add'
  | 'description-edit'
  | `note-color-${NoteColor}`
  | 'move-to-trash';

const MEDIA_KINDS = new Set(['image', 'video', 'pdf', 'font', 'link']);

/** Which right-click entries make sense for what was clicked (Patch 1 · B6), in menu order. */
/** `cropped`: the single clicked picture has an owner's crop (Patch 2 · C3). */
export function contextMenuItemIds(
  items: Item[],
  ctx: { onBoard: boolean; cropped?: boolean },
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
  if (items.length > 0 && items.every((i) => MEDIA_KINDS.has(i.kind)))
    ids.push(items.every((i) => i.favorite) ? 'remove-favorite' : 'add-favorite');
  if (items.length > 0 && items.every((i) => !!i.filePath)) ids.push('show-in-explorer');
  ids.push('bring-to-front', 'send-to-back');
  if (items.length >= 2) ids.push('tidy-up');
  if (items.length === 1) ids.push('connect-to');
  if (items.length > 0 && items.every((i) => MEDIA_KINDS.has(i.kind))) ids.push('back-to-inbox');
  // Swatches and palettes carry a derived `palette` too, but extracting from them is pointless.
  if (items.some((i) => i.kind !== 'swatch' && (i.palette?.length ?? 0) > 0))
    ids.push('extract-palette');
  // One media item: add or edit its long description (Patch 1 · E4).
  const only = items.length === 1 ? items[0] : null;
  if (only && isMediaKind(only.kind))
    ids.push(only.descriptionText?.trim() ? 'description-edit' : 'description-add');
  const allSwatches = items.length > 0 && items.every((i) => i.kind === 'swatch');
  if (allSwatches && items.length >= 2) ids.push('combine-palette');
  if (allSwatches && items.length === 1) ids.push('edit-palette', 'copy-colors');
  ids.push('create-board');
  if (ctx.onBoard) ids.push('remove-from-board');
  ids.push('move-to-trash');
  return ids;
}
