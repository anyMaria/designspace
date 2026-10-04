import type { Item, ItemKind } from '@/state/types';

const MEDIA_KINDS: ReadonlySet<ItemKind> = new Set(['image', 'video', 'pdf', 'font', 'link']);

/** Items you collect and classify (Type, Vibe, Movement, Tags, …). Notes and swatches/palettes are
 * things you make, so they are not classified (Patch 1 · D3). */
export function isMediaKind(kind: ItemKind): boolean {
  return MEDIA_KINDS.has(kind);
}

/** Like `isMediaKind`, but a type collection is not media: it has no file and is not classified
 * (Patch 2 · F5). */
export function isMediaItem(item: Pick<Item, 'kind' | 'fontCollection'>): boolean {
  return isMediaKind(item.kind) && !(item.kind === 'font' && item.fontCollection);
}
