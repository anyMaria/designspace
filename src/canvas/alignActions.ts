import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useListStore } from '@/state/listStore';
import { useHistoryStore } from '@/commands/history';
import {
  createMoveItemsCommand,
  createResizeItemsCommand,
  createTidyUpCommand,
} from '@/commands/itemCommands';
import { sortItems } from '@/features/list/listGrouping';
import { en } from '@/i18n/en';
import {
  align,
  distribute,
  matchSize,
  type AlignMode,
  type AlignRect,
  type SizeEntry,
} from './alignMath';

export type AlignAction =
  AlignMode | 'distribute-x' | 'distribute-y' | 'same-width' | 'same-height' | 'tidy-up';

export const ALIGN_LABEL: Record<AlignAction, string> = {
  left: en.align.left,
  hcenter: en.align.center,
  right: en.align.right,
  top: en.align.top,
  vcenter: en.align.middle,
  bottom: en.align.bottom,
  'distribute-x': en.align.distributeX,
  'distribute-y': en.align.distributeY,
  'same-width': en.align.sameWidth,
  'same-height': en.align.sameHeight,
  'tidy-up': en.align.tidyUp,
};

/** The selected cards that can be arranged by hand: placed, not in the Trash, and not a row
 * inside a type collection (those are laid out by their collection). */
export function arrangeableIds(ids: string[]): string[] {
  const { placements, items } = useLibraryStore.getState();
  return ids.filter((id) => {
    const p = placements.get(id);
    return !!p && !p.parentId && !items.get(id)?.deletedAt;
  });
}

function rectsOf(ids: string[]): AlignRect[] {
  const { placements } = useLibraryStore.getState();
  return ids.flatMap((id) => {
    const p = placements.get(id);
    return p ? [{ id, x: p.x, y: p.y, w: p.w, h: p.h }] : [];
  });
}

/** Tidy up, in the List's current sort order (the same rule as the right-click entry). */
function tidyUp(platform: Platform, ids: string[]): void {
  const { items } = useLibraryStore.getState();
  const tidyable = ids.filter((id) => !items.get(id)?.fontCollection);
  const ordered = sortItems(tidyable, useListStore.getState().sortBy, items);
  void useHistoryStore.getState().execute(createTidyUpCommand(platform, ordered));
}

/** Runs one align / distribute / same-size / tidy action on the selection as one undo step. */
export function runAlignAction(platform: Platform, selection: string[], action: AlignAction): void {
  const ids = arrangeableIds(selection);
  if (ids.length < 2) return;
  const label = ALIGN_LABEL[action];
  const history = useHistoryStore.getState();

  if (action === 'tidy-up') return tidyUp(platform, ids);

  if (action === 'same-width' || action === 'same-height') {
    const { placements, items } = useLibraryStore.getState();
    const entries: SizeEntry[] = ids.flatMap((id) => {
      const p = placements.get(id);
      const item = items.get(id);
      return p && item
        ? [{ id, x: p.x, y: p.y, w: p.w, h: p.h, kind: item.kind, cropX: p.cropX }]
        : [];
    });
    const updates = matchSize(entries, action === 'same-width' ? 'w' : 'h');
    if (updates.length > 0)
      void history.execute(createResizeItemsCommand(platform, updates, label));
    return;
  }

  const rects = rectsOf(ids);
  const updates =
    action === 'distribute-x'
      ? distribute(rects, 'x')
      : action === 'distribute-y'
        ? distribute(rects, 'y')
        : align(rects, action);
  if (updates.length > 0) void history.execute(createMoveItemsCommand(platform, updates, label));
}
