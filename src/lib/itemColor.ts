import { noteColors, type NoteColor } from '@/design/tokens';
import type { Item } from '@/state/types';

const FALLBACK_COLOR = 0x6f5a7a;

function hexToInt(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : FALLBACK_COLOR;
}

/** An item's card colour as packed 0xRRGGBB (note paper, swatch colour, first palette colour),
 * for the minimap and the Overview. */
export function itemColorOf(item: Item | undefined): number {
  if (!item) return FALLBACK_COLOR;
  if (item.kind === 'note') return noteColors[(item.color as NoteColor | null) ?? 'cream'];
  if (item.kind === 'swatch') return item.color ? hexToInt(item.color) : FALLBACK_COLOR;
  const first = item.palette?.[0]?.hex;
  return first ? hexToInt(first) : FALLBACK_COLOR;
}
