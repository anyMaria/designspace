import type { Item } from '@/state/types';
import { en } from '@/i18n/en';

/** The text of the hover name pill (Patch 1 · B3), or null when the item shouldn't get one:
 * notes never do, and swatches only when they have a name. */
export function hoverNameFor(item: Item): string | null {
  const title = item.title.trim();
  if (item.kind === 'note') return null;
  if (item.kind === 'swatch') return title || null;
  return title || item.fileName || en.kind[item.kind];
}
