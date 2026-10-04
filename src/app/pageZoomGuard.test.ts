import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPageZoomGuard } from './pageZoomGuard';

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

function wheel(init: WheelEventInit): WheelEvent {
  const e = new WheelEvent('wheel', { cancelable: true, bubbles: true, ...init });
  document.body.dispatchEvent(e);
  return e;
}

function key(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  document.body.dispatchEvent(e);
  return e;
}

describe('installPageZoomGuard', () => {
  it('cancels Ctrl+wheel (and pinch, which arrives as Ctrl+wheel) but not a plain wheel', () => {
    uninstall = installPageZoomGuard(window);
    expect(wheel({ ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(true);
    expect(wheel({ deltaY: -10 }).defaultPrevented).toBe(false);
  });

  it('cancels Ctrl +, -, = and 0 but not the plain keys', () => {
    uninstall = installPageZoomGuard(window);
    expect(key({ key: '=', code: 'Equal', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key({ key: '-', code: 'Minus', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key({ key: '0', code: 'Digit0', metaKey: true }).defaultPrevented).toBe(true);
    expect(key({ key: '=', code: 'Equal' }).defaultPrevented).toBe(false);
  });

  it('does not stop propagation: the app still sees the event', () => {
    uninstall = installPageZoomGuard(window);
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    key({ key: '=', code: 'Equal', ctrlKey: true });
    window.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('stops cancelling once uninstalled', () => {
    installPageZoomGuard(window)();
    expect(wheel({ ctrlKey: true }).defaultPrevented).toBe(false);
  });
});
