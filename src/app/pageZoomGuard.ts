const ZOOM_KEYS = new Set(['=', '+', '-', '_', '0']);
const ZOOM_CODES = new Set(['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0']);

/** WebView2 page zoom must never happen (only the map zooms). Tauri's zoomHotkeysEnabled is on so
 * touchpad pinch reaches the page (A9); this cancels the browser's own handling of Ctrl+wheel,
 * pinch and Ctrl +/−/0 without stopping the app's listeners. */
export function installPageZoomGuard(target: Window = window): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (ZOOM_KEYS.has(e.key) || ZOOM_CODES.has(e.code)))
      e.preventDefault();
  };
  target.addEventListener('wheel', onWheel, { passive: false, capture: true });
  target.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    target.removeEventListener('wheel', onWheel, { capture: true });
    target.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}
