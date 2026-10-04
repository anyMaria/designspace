import { Container, Graphics } from 'pixi.js';
import { noteColors, noteGeometry, noteStyles, type NoteColor } from '@/design/tokens';

/** Draws a note's ruled paper with the top-right corner cut and folded (Patch 1 · D1) into
 * `container`, in the container's local space (origin = the card's top-left), and returns a mask
 * the size of the paper for the note's text label, so long text never spills out. Clears what it
 * drew before. */
export function drawNotePaper(
  container: Container,
  size: { w: number; h: number },
  color: NoteColor,
): Graphics {
  for (const child of container.removeChildren()) child.destroy({ children: true });
  const { w, h } = size;
  const { radius: r, fold: f, pad, lineHeight } = noteGeometry;
  const style = noteStyles[color];

  const g = new Graphics();
  g.moveTo(r, 0)
    .lineTo(w - f, 0)
    .lineTo(w, f)
    .lineTo(w, h - r)
    .arcTo(w, h, w - r, h, r)
    .lineTo(r, h)
    .arcTo(0, h, 0, h - r, r)
    .lineTo(0, r)
    .arcTo(0, 0, r, 0, r)
    .closePath()
    .fill(noteColors[color]);
  g.poly([w - f, 0, w - f, f, w, f]).fill(style.fold);
  for (let y = pad + lineHeight; y <= h - pad / 2; y += lineHeight) {
    g.moveTo(pad, y).lineTo(w - pad, y);
  }
  g.stroke({ color: style.rule, alpha: style.ruleAlpha, width: 1 });
  container.addChild(g);

  const mask = new Graphics().rect(0, 0, w, h).fill(0xffffff);
  container.addChild(mask);
  return mask;
}

/** A cache key for what `drawNotePaper` would draw. */
export function notePaperKey(size: { w: number; h: number }, color: NoteColor): string {
  return `${size.w}x${size.h}|${color}`;
}
