import type { Item } from '@/state/types';
import { hashtagLines } from '@/lib/hashtags';

export interface ActionEntry {
  tag: string;
  itemId: string;
  line: string;
  /** Where the hashtag was written: in a note's text, or in an item's long description (Phase E). */
  source: 'note' | 'description';
  updatedAt: string;
}

export interface ActionGroup {
  tag: string;
  entries: ActionEntry[];
}

/** Every #action written in a note or an item's description, grouped by tag: groups A–Z, most
 * recently updated item first inside a group (Patch 1 · D4). Items in the Trash are ignored. */
export function collectActions(items: Iterable<Item>): ActionGroup[] {
  const groups = new Map<string, ActionEntry[]>();
  const add = (item: Item, text: string | null | undefined, source: ActionEntry['source']) => {
    if (!text) return;
    for (const { tag, line } of hashtagLines(text)) {
      const list = groups.get(tag) ?? [];
      list.push({ tag, itemId: item.id, line, source, updatedAt: item.updatedAt });
      groups.set(tag, list);
    }
  };
  for (const item of items) {
    if (item.deletedAt) continue;
    if (item.kind === 'note') add(item, item.bodyText, 'note');
    add(item, item.descriptionText, 'description');
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, entries]) => ({
      tag,
      entries: entries.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
    }));
}
