import { converter, formatHex } from 'culori';
import { paletteGeometry } from '@/design/tokens';
import { colorFamily, type PaletteEntry } from '@/lib/color';
import type { Item, SwatchColor } from '@/state/types';

export type { SwatchColor };

const DEFAULT_HEX = '#8C8C8C';
const toHsv = converter('hsv');

/** `#abc`, `abc`, `#aabbcc` or `AABBCC` → `#AABBCC`; anything else → null. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${digits.toUpperCase()}`;
}

/** A swatch's colours: its palette list, else its single legacy `color`, else the default grey. */
export function swatchColorsOf(item: Pick<Item, 'swatchColors' | 'color'>): SwatchColor[] {
  if (item.swatchColors && item.swatchColors.length > 0) return item.swatchColors;
  if (item.color) return [{ hex: item.color }];
  return [{ hex: DEFAULT_HEX }];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The card's size for `n` colours: one colour is a plain swatch, more make two columns. */
export function paletteCardSize(n: number): { w: number; h: number } {
  const { cell, gap, pad, singleSize } = paletteGeometry;
  if (n <= 1) return { w: singleSize, h: singleSize };
  const rows = Math.ceil(n / 2);
  return { w: pad * 2 + cell * 2 + gap, h: pad * 2 + rows * cell + (rows - 1) * gap };
}

/** World rects of each colour cell, row-major in 2 columns; a single colour fills the card. */
export function paletteCells(n: number, card: Rect): Rect[] {
  if (n <= 1) return n === 1 ? [{ x: card.x, y: card.y, w: card.w, h: card.h }] : [];
  const { cell, gap, pad } = paletteGeometry;
  return Array.from({ length: n }, (_, i) => ({
    x: card.x + pad + (i % 2) * (cell + gap),
    y: card.y + pad + Math.floor(i / 2) * (cell + gap),
    w: cell,
    h: cell,
  }));
}

/** Index of the colour cell under a world point, or null (gaps and padding are not cells). */
export function paletteCellAt(
  n: number,
  card: Rect,
  point: { x: number; y: number },
): number | null {
  const cells = paletteCells(n, card);
  const i = cells.findIndex(
    (c) => point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h,
  );
  return i === -1 ? null : i;
}

/** Equal-weight palette entries, so palettes join the Color filter and Color connections. */
export function paletteEntriesOf(colors: SwatchColor[]): PaletteEntry[] {
  return colors.map((c) => ({ hex: c.hex, weight: 1 / colors.length }));
}

export function colorFamiliesOf(colors: SwatchColor[]): string[] {
  return [...new Set(colors.map((c) => colorFamily(c.hex)))];
}

/** h in degrees 0–360; s, v in 0–1. Greys have no hue: culori leaves it undefined, we use 0. */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const c = toHsv(hex);
  return { h: c?.h ?? 0, s: c?.s ?? 0, v: c?.v ?? 0 };
}

export function hsvToHex(h: number, s: number, v: number): string {
  return formatHex({ mode: 'hsv', h, s, v }).toUpperCase();
}
