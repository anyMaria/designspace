import { describe, expect, it } from 'vitest';
import { placeMenu } from './placeMenu';

const vp = { w: 1280, h: 720 };
describe('placeMenu', () => {
  it('opens at the pointer when it fits', () => {
    expect(placeMenu({ x: 100, y: 100 }, { w: 200, h: 300 }, vp)).toEqual({ x: 100, y: 100 });
  });
  it('flips up near the bottom', () => {
    expect(placeMenu({ x: 100, y: 600 }, { w: 200, h: 300 }, vp)).toEqual({ x: 100, y: 300 });
  });
  it('flips left near the right edge', () => {
    expect(placeMenu({ x: 1200, y: 100 }, { w: 200, h: 300 }, vp)).toEqual({ x: 1000, y: 100 });
  });
  it('clamps when flipping is not enough', () => {
    expect(placeMenu({ x: 100, y: 380 }, { w: 200, h: 400 }, vp)).toEqual({ x: 100, y: 8 });
  });
  it('pins a menu taller than the window to the top margin', () => {
    expect(placeMenu({ x: 100, y: 500 }, { w: 200, h: 900 }, vp)).toEqual({ x: 100, y: 8 });
  });
});
