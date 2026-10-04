/** A counted set of blocking full-window overlays (Patch 2 · E2). While one is open (the Color
 * studio), the canvas' Space-to-pan and the map's single-key shortcuts stand down, so Space can
 * mean "new colors" without panning the map underneath. */
const open = new Set<symbol>();

/** Registers an open overlay; call the returned function to remove it. */
export function openBlockingOverlay(name: string): () => void {
  const token = Symbol(name);
  open.add(token);
  return () => {
    open.delete(token);
  };
}

export function isBlockingOverlayOpen(): boolean {
  return open.size > 0;
}
