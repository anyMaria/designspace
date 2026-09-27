import type { Item, Placement } from '@/state/types';
import type { Platform } from '@/platform/types';
import type { ItemCard } from './Engine';

const FALLBACK_COLOR = 0x33203d; // --surface-2, used until a palette exists

function hexToInt(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? FALLBACK_COLOR : parsed;
}

/** Maps a library Item + its Placement to the canvas engine's `ItemCard` — §4.6. Thumbnails
 * are only requested once ingest has produced them (`status === 'ok'`); before that the card
 * shows as a flat tinted placeholder (§2.3 "Items appear at once as placeholders tinted with
 * their dominant color, then sharpen"). */
export function itemToCard(item: Item, placement: Placement, platform: Platform): ItemCard {
  const dominantColor = item.palette?.[0]?.hex ? hexToInt(item.palette[0].hex) : FALLBACK_COLOR;
  const ready = item.status === 'ok';
  return {
    id: item.id,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    z: placement.z,
    dominantColor,
    thumbUrl128: ready ? platform.cache.url(`t128/${item.id}`) : null,
    thumbUrl512: ready ? platform.cache.url(`t512/${item.id}`) : null,
  };
}
