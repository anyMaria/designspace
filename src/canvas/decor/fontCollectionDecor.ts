import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { colors, fonts, fontCollectionGeometry as G } from '@/design/tokens';
import { en } from '@/i18n/en';

export interface FontCollectionSpec {
  w: number;
  h: number;
  title: string;
  count: number;
}

const RADIUS = 16;
const ICON_SIZE = 22;

function text(value: string, size: number, weight: '500' | '700', fill: number): Text {
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

/** Draws a type collection (Patch 2 · F5): a card with a header (a type icon, the name, "n families")
 * and a hairline between rows. The rows themselves are the families' own cards, drawn on top. */
export function drawFontCollection(container: Container, spec: FontCollectionSpec): void {
  for (const child of container.removeChildren()) child.destroy({ children: true });
  const g = new Graphics();
  container.addChild(g);
  g.roundRect(0, 0, spec.w, spec.h, RADIUS)
    .fill(colors.surface1)
    .stroke({ color: colors.hairline, alpha: colors.hairlineAlpha, width: 1 });

  // The type icon: a big "A" in a rounded square.
  g.roundRect(14, (G.header - ICON_SIZE) / 2, ICON_SIZE, ICON_SIZE, 6).fill(colors.surface3);
  const letter = text('A', 14, '700', colors.text1);
  letter.position.set(14 + (ICON_SIZE - letter.width) / 2, (G.header - letter.height) / 2);
  container.addChild(letter);

  const name = text(spec.title, 16, '700', colors.text1);
  name.position.set(14 + ICON_SIZE + 10, (G.header - name.height) / 2);
  container.addChild(name);
  const count = text(en.fontCollection.families(spec.count), 12, '500', colors.text3);
  count.position.set(spec.w - 14 - count.width, (G.header - count.height) / 2);
  container.addChild(count);

  for (let i = 0; i < spec.count; i++) {
    const y = G.header + i * G.row;
    g.moveTo(12, y)
      .lineTo(spec.w - 12, y)
      .stroke({
        color: colors.hairline,
        alpha: colors.hairlineAlpha,
        width: 1,
      });
  }
}

/** A cache key for what `drawFontCollection` draws: redraw only when it changes. */
export function fontCollectionDrawKey(card: {
  w: number;
  h: number;
  collection?: { title: string; count: number } | null;
}): string {
  return `${card.w}x${card.h}|${card.collection?.title ?? ''}|${card.collection?.count ?? 0}`;
}
