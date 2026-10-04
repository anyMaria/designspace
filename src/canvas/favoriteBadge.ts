import { Container, Graphics } from 'pixi.js';
import { colors } from '@/design/tokens';

/** A favourite's badge (Patch 2 · C6): a dark disc with an amber star, in world units, drawn at a
 * card's top-left corner (the thought bubble is top-right, duration/page badges bottom-right). */
export const FAVORITE_BADGE_SIZE = 24;
export const FAVORITE_BADGE_INSET = 8;
/** Below this zoom the badge would only be noise. */
export const FAVORITE_BADGE_MIN_ZOOM = 0.25;

export function createFavoriteBadge(): Container {
  const badge = new Container();
  const r = FAVORITE_BADGE_SIZE / 2;
  badge.addChild(new Graphics().circle(r, r, r).fill({ color: colors.canvas, alpha: 0.72 }));
  badge.addChild(new Graphics().star(r, r + 0.5, 5, 7, 3.2).fill(colors.accent));
  badge.eventMode = 'none';
  return badge;
}
