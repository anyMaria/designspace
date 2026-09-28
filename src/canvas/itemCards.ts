import type { Item, Placement } from '@/state/types';
import type { Platform } from '@/platform/types';
import type { ItemCard } from './Engine';
import { noteColors, type NoteColor } from '@/design/tokens';
import { noteBodyToPlainText } from '@/lib/noteText';

const FALLBACK_COLOR = 0x33203d; // --surface-2, used until a palette exists
const DEFAULT_NOTE_COLOR: NoteColor = 'cream';

function hexToInt(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? FALLBACK_COLOR : parsed;
}

/** Maps a library Item + its Placement to the canvas engine's `ItemCard` — §4.6. Thumbnails
 * are only requested once ingest has produced them (`status === 'ok'`); before that the card
 * shows as a flat tinted placeholder (§2.3 "Items appear at once as placeholders tinted with
 * their dominant color, then sharpen"). Notes (§2.11) never get a thumbnail — they're always
 * a flat color card (their own `color` token) with a plain-text snippet the engine draws as a
 * `Text` child (see `Engine.setLibraryItems`'s note-label handling and Spike S4 in DECISIONS.md
 * for why that's a plain-text snippet rather than a full `HTMLText` render of the rich content). */
export function itemToCard(item: Item, placement: Placement, platform: Platform): ItemCard {
  if (item.kind === 'note') {
    const colorName = (item.color as NoteColor | null) ?? DEFAULT_NOTE_COLOR;
    const dominantColor = noteColors[colorName] ?? noteColors[DEFAULT_NOTE_COLOR];
    return {
      id: item.id,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: placement.z,
      kind: 'note',
      dominantColor,
      thumbUrl128: null,
      thumbUrl512: null,
      noteText: noteBodyToPlainText(item.body),
      frameId: placement.frameId,
    };
  }

  if (item.kind === 'swatch') {
    return {
      id: item.id,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: placement.z,
      kind: 'swatch',
      dominantColor: item.color ? hexToInt(item.color) : FALLBACK_COLOR,
      thumbUrl128: null,
      thumbUrl512: null,
      // "Color block with its HEX and an optional name" (§2.11's spec table).
      noteText: [item.title || null, item.color?.toUpperCase() ?? null].filter(Boolean).join('\n'),
      frameId: placement.frameId,
    };
  }

  const dominantColor = item.palette?.[0]?.hex ? hexToInt(item.palette[0].hex) : FALLBACK_COLOR;
  const ready = item.status === 'ok';
  return {
    id: item.id,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    z: placement.z,
    kind: item.kind,
    dominantColor,
    thumbUrl128: ready ? platform.cache.url(`t128/${item.id}`) : null,
    thumbUrl512: ready ? platform.cache.url(`t512/${item.id}`) : null,
    noteText: null,
    frameId: placement.frameId,
  };
}
