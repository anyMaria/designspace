import type { Item } from '@/state/types';

export type ContextMenuItemId =
  | 'copy-image'
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
  | 'move-to-trash';

const MEDIA_KINDS = new Set(['image', 'video', 'pdf', 'font', 'link']);

/** Which right-click entries make sense for what was clicked (Patch 1 · B6), in menu order. */
export function contextMenuItemIds(items: Item[], ctx: { onBoard: boolean }): ContextMenuItemId[] {
  const ids: ContextMenuItemId[] = [];
  if (items.length === 1 && items[0]?.kind === 'image') ids.push('copy-image');
  if (items.length > 0 && items.every((i) => !!i.filePath)) ids.push('show-in-explorer');
  ids.push('bring-to-front', 'send-to-back');
  if (items.length >= 2) ids.push('tidy-up');
  if (items.length === 1) ids.push('connect-to');
  if (items.length > 0 && items.every((i) => MEDIA_KINDS.has(i.kind))) ids.push('back-to-inbox');
  // Swatches and palettes carry a derived `palette` too, but extracting from them is pointless.
  if (items.some((i) => i.kind !== 'swatch' && (i.palette?.length ?? 0) > 0))
    ids.push('extract-palette');
  const allSwatches = items.length > 0 && items.every((i) => i.kind === 'swatch');
  if (allSwatches && items.length >= 2) ids.push('combine-palette');
  if (allSwatches && items.length === 1) ids.push('edit-palette', 'copy-colors');
  ids.push('create-board');
  if (ctx.onBoard) ids.push('remove-from-board');
  ids.push('move-to-trash');
  return ids;
}
