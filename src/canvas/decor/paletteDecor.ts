import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { colors, fonts, noteTextColor, paletteGeometry } from '@/design/tokens';
import { paletteCells } from '@/lib/palette';

export interface PaletteSpec {
  w: number;
  h: number;
  /** `#RRGGBB` per colour. */
  colors: string[];
  name: string | null;
}

const HEX_FONT_SINGLE = 14; // world units
const HEX_FONT_CELL = 12;
const NAME_FONT = 16;
const NAME_GAP = 22; // world units above the card
const LABEL_INSET = 8;

function hexToInt(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return Number.isFinite(n) ? n : 0x8c8c8c;
}

/** Dark text on a light colour, white on a dark one. */
export function readableOn(packed: number): number {
  const r = (packed >> 16) & 0xff;
  const g = (packed >> 8) & 0xff;
  const b = packed & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? noteTextColor : 0xffffff;
}

function text(value: string, size: number, weight: '600' | '700', fill: number): Text {
  const style: TextStyleOptions = {
    fontFamily: fonts.ui,
    fontWeight: weight,
    fontSize: size,
    fill,
  };
  const t = new Text({ text: value, style });
  t.eventMode = 'none';
  return t;
}

/** Whether per-cell hex labels fit at this zoom (a cell must be at least `labelMinCellPx` wide). */
export function cellLabelsVisible(zoom: number): boolean {
  return paletteGeometry.cell * zoom >= paletteGeometry.labelMinCellPx;
}

/** Draws a swatch (one colour: a rounded square with its hex) or a palette (several: a rounded
 * card with two columns of rounded squares) into `container`, in the container's local space
 * (its origin is the card's top-left). Clears what it drew before, so call it again to redraw. */
export function drawPalette(container: Container, spec: PaletteSpec, zoom: number): void {
  for (const child of container.removeChildren()) child.destroy({ children: true });
  const { w, h } = spec;
  const g = new Graphics();
  container.addChild(g);

  if (spec.colors.length <= 1) {
    const hex = spec.colors[0] ?? '#8C8C8C';
    const fill = hexToInt(hex);
    g.roundRect(0, 0, w, h, paletteGeometry.singleRadius).fill(fill);
    const label = text(hex.toUpperCase(), HEX_FONT_SINGLE, '700', readableOn(fill));
    label.position.set(LABEL_INSET, h - LABEL_INSET - label.height);
    container.addChild(label);
  } else {
    g.roundRect(0, 0, w, h, paletteGeometry.cardRadius)
      .fill({ color: 0xffffff, alpha: 0.04 })
      .stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    const showLabels = cellLabelsVisible(zoom);
    paletteCells(spec.colors.length, { x: 0, y: 0, w, h }).forEach((cell, i) => {
      const hex = spec.colors[i];
      const fill = hexToInt(hex);
      g.roundRect(cell.x, cell.y, cell.w, cell.h, paletteGeometry.cellRadius).fill(fill);
      if (!showLabels) return;
      const label = text(hex.toUpperCase(), HEX_FONT_CELL, '700', readableOn(fill));
      label.position.set(cell.x + LABEL_INSET, cell.y + cell.h - LABEL_INSET - label.height);
      container.addChild(label);
    });
  }

  if (spec.name) {
    const label = text(spec.name, NAME_FONT, '600', colors.text1);
    label.position.set(0, -NAME_GAP);
    container.addChild(label);
  }
}

/** A cache key for what `drawPalette` would draw: redraw only when it changes. */
export function paletteDrawKey(spec: PaletteSpec, zoom: number): string {
  const labels = spec.colors.length > 1 && cellLabelsVisible(zoom) ? 'L' : '-';
  return `${spec.w}x${spec.h}|${spec.colors.join(',')}|${spec.name ?? ''}|${labels}`;
}
