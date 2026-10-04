import type { Camera } from './Camera';
import { isTypingTarget } from '@/lib/isTypingTarget';
import { isBlockingOverlayOpen } from '@/app/overlayGate';

export type Tool = 'select' | 'hand';
export type WheelMode = 'zoom' | 'pan';

export interface CanvasInputOptions {
  getViewport: () => { w: number; h: number };
  getTool: () => Tool;
  getWheelMode: () => WheelMode;
}

/** Heuristic from §2.2: touchpads report pixel-mode deltas that are fractional, carry a
 * horizontal component, or are small — real mouse wheels report large integer notches. */
function isLikelyTouchpad(e: WheelEvent): boolean {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  return !Number.isInteger(e.deltaY) || e.deltaX !== 0 || Math.abs(e.deltaY) < 50;
}

/**
 * Wires wheel/touchpad zoom-or-pan, and drag-panning (Hand tool, held Space, or the middle
 * mouse button) onto `container`. Returns a cleanup function. See §2.2 and §4.6.
 */
export function attachCanvasInput(
  container: HTMLElement,
  camera: Camera,
  opts: CanvasInputOptions,
): () => void {
  let spacePressed = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { w, h } = opts.getViewport();

    // A trackpad pinch gesture arrives as a wheel event with ctrlKey set (Chromium convention).
    if (e.ctrlKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      camera.zoomAt(sx, sy, camera.zoom * factor, w, h);
      return;
    }

    if (isLikelyTouchpad(e)) {
      // Scroll-pan convention: content shifts opposite the scroll, like a document.
      camera.panByScreen(-e.deltaX, -e.deltaY);
      return;
    }

    if (opts.getWheelMode() === 'pan') {
      camera.panByScreen(-e.deltaX, -e.deltaY);
    } else {
      const factor = Math.exp(-e.deltaY * 0.0015);
      camera.zoomAt(sx, sy, camera.zoom * factor, w, h);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (
      e.code === 'Space' &&
      !isTypingTarget(e.target) &&
      !spacePressed &&
      !isBlockingOverlayOpen()
    ) {
      spacePressed = true;
      if (!panning) container.style.cursor = 'grab';
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spacePressed = false;
      if (!panning) container.style.cursor = '';
    }
  }

  function shouldStartPan(e: PointerEvent): boolean {
    return e.button === 1 || spacePressed || (e.button === 0 && opts.getTool() === 'hand');
  }

  function onPointerDown(e: PointerEvent) {
    if (!shouldStartPan(e)) return;
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    container.setPointerCapture(e.pointerId);
    container.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function onPointerMove(e: PointerEvent) {
    if (!panning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    // Drag convention: content follows the pointer.
    camera.panByScreen(dx, dy);
  }
  function onPointerUp(e: PointerEvent) {
    if (!panning) return;
    panning = false;
    container.releasePointerCapture(e.pointerId);
    container.style.cursor = spacePressed ? 'grab' : '';
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('contextmenu', (e) => e.preventDefault());

  return () => {
    container.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', onPointerUp);
  };
}
