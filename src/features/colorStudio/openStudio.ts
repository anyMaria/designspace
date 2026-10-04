import { harmony } from '@/lib/colorStudio';
import { hsvToHex, swatchColorsOf } from '@/lib/palette';
import type { Item } from '@/state/types';
import { useColorStudioStore } from './colorStudioStore';

const NEW_PALETTE_SPOTS = 5;

/** + Add → Palette…: five analogous colours from a random base, on the Generate tab. */
export function openNewPalette(): void {
  const base = {
    h: Math.random() * 360,
    s: 0.45 + Math.random() * 0.3,
    v: 0.7 + Math.random() * 0.25,
  };
  const hexes = harmony(base, 'analogous', NEW_PALETTE_SPOTS).map((c) => hsvToHex(c.h, c.s, c.v));
  useColorStudioStore.getState().openStudio({ kind: 'new' }, { name: '', hexes, tab: 'generate' });
}

/** Double-click on a palette or swatch: its colours, on the Wheel tab. */
export function openEditPalette(item: Item): void {
  useColorStudioStore
    .getState()
    .openStudio(
      { kind: 'edit', itemId: item.id },
      { name: item.title ?? '', hexes: swatchColorsOf(item).map((c) => c.hex), tab: 'wheel' },
    );
}

/** Make a palette from a photo: the colours the app sampled, on the From an image tab. */
export function openFromPhoto(item: Item): void {
  const hexes = (item.palette ?? []).map((p) => p.hex);
  useColorStudioStore
    .getState()
    .openStudio(
      { kind: 'fromPhoto', itemId: item.id },
      { name: '', hexes: hexes.length > 0 ? hexes : ['#8C8C8C'], tab: 'image' },
    );
}
