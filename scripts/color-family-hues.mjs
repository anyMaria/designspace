// Prints the OKLCH lightness/chroma/hue for each family token in src/design/tokens.css, plus a
// few reference primaries — used to derive the hue-bucket boundaries in src/lib/color.ts. Run
// with `node scripts/color-family-hues.mjs` after changing a family token's hex value.
import { converter } from 'culori';

const toOklch = converter('oklch');
const colors = {
  red: '#e05a5a',
  orange: '#ee8e3a',
  yellow: '#efd05a',
  green: '#6dbe6a',
  teal: '#4fb7a8',
  blue: '#5a8fe0',
  purple: '#9a6be0',
  pink: '#e07ab8',
  brown: '#9a6b4b',
  pureRed: '#ff0000',
  pureBlue: '#0000ff',
  pureGreen: '#00ff00',
  pureYellow: '#ffff00',
  pureMagenta: '#ff00ff',
  pureCyan: '#00ffff',
};

for (const [name, hex] of Object.entries(colors)) {
  const c = toOklch(hex);
  console.log(name, hex, 'L=', c.l?.toFixed(3), 'C=', c.c?.toFixed(3), 'H=', c.h?.toFixed(1));
}
