import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';

/** The URL of an item's cached thumbnail. `thumbV` goes into the URL (Patch 1 · F1), so a thumbnail
 * that was re-made (a font preview change, a PDF cover page) is a new URL and never shows stale. */
export function thumbUrl(
  platform: Platform,
  item: Pick<Item, 'id' | 'thumbV'>,
  size: 128 | 512,
): string {
  return platform.cache.url(`t${size}/${item.id}`, item.thumbV ?? 0);
}
