/** Where to put a menu of `size` opened at `anchor` (the pointer) so it stays inside the window:
 * flip it above / to the left of the pointer when it would pass the bottom / right edge, then
 * clamp it inside the `margin`. A menu bigger than the window is pinned to the top-left margin
 * (the menu itself scrolls: `max-height: calc(100vh - 16px)`). */
export function placeMenu(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  margin = 8,
): { x: number; y: number } {
  let x = anchor.x;
  let y = anchor.y;
  if (x + size.w > viewport.w - margin) x = anchor.x - size.w;
  if (y + size.h > viewport.h - margin) y = anchor.y - size.h;
  x = Math.max(margin, Math.min(x, viewport.w - size.w - margin));
  y = Math.max(margin, Math.min(y, viewport.h - size.h - margin));
  return { x, y };
}
