import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { fonts, snap } from '@/design/tokens';
import type { GapGuide, SnapGuide } from './snapping';

export interface SnapOverlay {
  guides: SnapGuide[];
  gaps: GapGuide[];
  /** Resizing: world-space rects whose width or height matches a neighbour, to mark with "=". */
  equalSides?: { rect: { x: number; y: number; w: number; h: number }; sides: ('w' | 'h')[] };
}

type ToScreen = (wx: number, wy: number) => { x: number; y: number };

const TICK_PX = 4;

/** Draws the snapping guides in screen space (constant one pixel wide at any zoom): lines where
 * edges and centres align, bars with the size of equal gaps, and "=" where a size matches
 * (Patch 3 · C2, C3). One instance lives in the engine's overlay layer. */
export class SnapGuideLayer {
  readonly container = new Container();
  private graphics = new Graphics();
  private labels: Text[] = [];

  constructor() {
    this.container.addChild(this.graphics);
    this.container.eventMode = 'none';
  }

  show(overlay: SnapOverlay, toScreen: ToScreen): void {
    const g = this.graphics;
    g.clear();
    let labelIndex = 0;
    const stroke = { color: snap.guide, width: snap.guideWidthPx, alpha: 1 };

    for (const guide of overlay.guides) {
      const a =
        guide.axis === 'x' ? toScreen(guide.at, guide.from) : toScreen(guide.from, guide.at);
      const b = guide.axis === 'x' ? toScreen(guide.at, guide.to) : toScreen(guide.to, guide.at);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(stroke);
    }

    for (const group of overlay.gaps) {
      for (const gap of group.gaps) {
        const horizontal = group.axis === 'x';
        const a = horizontal ? toScreen(gap.start, gap.cross) : toScreen(gap.cross, gap.start);
        const b = horizontal ? toScreen(gap.end, gap.cross) : toScreen(gap.cross, gap.end);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(stroke);
        // End ticks, across the bar.
        if (horizontal) {
          g.moveTo(a.x, a.y - TICK_PX)
            .lineTo(a.x, a.y + TICK_PX)
            .stroke(stroke);
          g.moveTo(b.x, b.y - TICK_PX)
            .lineTo(b.x, b.y + TICK_PX)
            .stroke(stroke);
        } else {
          g.moveTo(a.x - TICK_PX, a.y)
            .lineTo(a.x + TICK_PX, a.y)
            .stroke(stroke);
          g.moveTo(b.x - TICK_PX, b.y)
            .lineTo(b.x + TICK_PX, b.y)
            .stroke(stroke);
        }
        const label = this.label(labelIndex++);
        label.text = String(Math.round(gap.end - gap.start));
        label.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - (horizontal ? 3 : 0));
        label.visible = true;
      }
    }

    const eq = overlay.equalSides;
    if (eq) {
      const { x, y, w, h } = eq.rect;
      const marks: { wx: number; wy: number }[] = [];
      if (eq.sides.includes('w'))
        marks.push({ wx: x + w / 2, wy: y }, { wx: x + w / 2, wy: y + h });
      if (eq.sides.includes('h'))
        marks.push({ wx: x, wy: y + h / 2 }, { wx: x + w, wy: y + h / 2 });
      for (const m of marks) {
        const p = toScreen(m.wx, m.wy);
        g.moveTo(p.x - 4, p.y - 2)
          .lineTo(p.x + 4, p.y - 2)
          .stroke(stroke);
        g.moveTo(p.x - 4, p.y + 2)
          .lineTo(p.x + 4, p.y + 2)
          .stroke(stroke);
      }
    }

    for (let i = labelIndex; i < this.labels.length; i++) this.labels[i].visible = false;
  }

  clear(): void {
    this.graphics.clear();
    for (const l of this.labels) l.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private label(index: number): Text {
    let label = this.labels[index];
    if (!label) {
      const style: TextStyleOptions = {
        fontFamily: fonts.ui,
        fontWeight: '600',
        fontSize: snap.gapLabelFontSize,
        fill: snap.guide,
      };
      label = new Text({ text: '', style });
      label.anchor.set(0.5, 1);
      this.labels.push(label);
      this.container.addChild(label);
    }
    return label;
  }
}
