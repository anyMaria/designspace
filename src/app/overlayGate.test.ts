import { describe, expect, it } from 'vitest';
import { isBlockingOverlayOpen, openBlockingOverlay } from './overlayGate';

describe('overlayGate', () => {
  it('is open while any overlay holds it, and closes when the last one lets go', () => {
    expect(isBlockingOverlayOpen()).toBe(false);
    const closeA = openBlockingOverlay('a');
    const closeB = openBlockingOverlay('b');
    expect(isBlockingOverlayOpen()).toBe(true);
    closeA();
    expect(isBlockingOverlayOpen()).toBe(true);
    closeB();
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it('closing twice is harmless', () => {
    const close = openBlockingOverlay('x');
    close();
    close();
    expect(isBlockingOverlayOpen()).toBe(false);
  });
});
