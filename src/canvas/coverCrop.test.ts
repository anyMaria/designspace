import { describe, expect, it } from 'vitest';
import {
  cardUvToImageUv,
  coverFrame,
  dragCropFocus,
  isCropped,
  isWholeTexture,
  resetCropRect,
  visibleFraction,
} from './coverCrop';

describe('coverFrame', () => {
  it('same proportions: the whole texture', () => {
    expect(coverFrame(512, 256, 320, 160, null, null)).toEqual({ x: 0, y: 0, w: 512, h: 256 });
  });

  it('a wide picture in a square card shows the middle square by default', () => {
    expect(coverFrame(800, 400, 160, 160, null, null)).toEqual({ x: 200, y: 0, w: 400, h: 400 });
  });

  it('focus 0 / 1 shows the left / right edge', () => {
    expect(coverFrame(800, 400, 160, 160, 0, 0.5).x).toBe(0);
    expect(coverFrame(800, 400, 160, 160, 1, 0.5).x).toBe(400);
  });

  it('a tall picture in a wide card crops vertically', () => {
    expect(coverFrame(100, 200, 400, 100, 0.5, 0.25)).toEqual({ x: 0, y: 43.75, w: 100, h: 25 });
  });

  it('clamps a focus outside 0..1', () => {
    expect(coverFrame(800, 400, 160, 160, -3, 9)).toEqual({ x: 0, y: 0, w: 400, h: 400 });
    expect(coverFrame(800, 400, 160, 160, 7, 0).x).toBe(400);
  });

  it('is the same crop at every LOD (t128 vs t512 frames are proportional)', () => {
    const small = coverFrame(128, 64, 300, 200, 0.3, 0.5);
    const big = coverFrame(512, 256, 300, 200, 0.3, 0.5);
    expect(big.x / 512).toBeCloseTo(small.x / 128);
    expect(big.w / 512).toBeCloseTo(small.w / 128);
    expect(big.h / 256).toBeCloseTo(small.h / 64);
  });

  it('degenerate sizes fall back to the whole texture', () => {
    expect(coverFrame(512, 256, 0, 160, null, null)).toEqual({ x: 0, y: 0, w: 512, h: 256 });
    expect(coverFrame(512, 256, Number.NaN, 160, null, null)).toEqual({
      x: 0,
      y: 0,
      w: 512,
      h: 256,
    });
  });
});

describe('isWholeTexture', () => {
  it('ignores sub-pixel rounding of thumbnails', () => {
    // 1920×1280 original, t128 is 128×85, the fitted card is 320×213.
    const f = coverFrame(128, 85, 320, 213, null, null);
    expect(isWholeTexture(f, 128, 85)).toBe(true);
    expect(isWholeTexture(coverFrame(800, 400, 160, 160, null, null), 800, 400)).toBe(false);
  });
});

describe('visibleFraction', () => {
  it('one side is always fully visible', () => {
    expect(visibleFraction(2, 1)).toEqual({ fw: 0.5, fh: 1 });
    expect(visibleFraction(0.5, 1)).toEqual({ fw: 1, fh: 0.5 });
    expect(visibleFraction(2, 2)).toEqual({ fw: 1, fh: 1 });
  });
});

describe('dragCropFocus', () => {
  const card = { w: 160, h: 160 };

  it('the picture follows the pointer: dragging right by half a card reveals the left edge', () => {
    expect(dragCropFocus({ x: null, y: null }, { x: 80, y: 0 }, card, 2)).toEqual({
      x: 0,
      y: 0.5,
    });
  });

  it('clamps at the far edge', () => {
    expect(dragCropFocus({ x: 0.5, y: 0.5 }, { x: -1000, y: 0 }, card, 2).x).toBe(1);
  });

  it('an axis with nothing hidden does not move', () => {
    expect(dragCropFocus({ x: 0.2, y: 0.7 }, { x: 0, y: 50 }, card, 2)).toEqual({ x: 0.2, y: 0.7 });
  });
});

describe('isCropped', () => {
  it('compares the card with the picture, with a 1 % tolerance', () => {
    expect(isCropped({ w: 320, h: 160 }, 2)).toBe(false);
    expect(isCropped({ w: 320, h: 107 }, 3000 / 1000)).toBe(false); // integer rounding
    expect(isCropped({ w: 160, h: 160 }, 2)).toBe(true);
  });
});

describe('resetCropRect', () => {
  it('restores the picture proportions with the same centre and area', () => {
    const r = resetCropRect({ x: 0, y: 0, w: 200, h: 200 }, 4);
    expect(r.w / r.h).toBeCloseTo(4);
    expect(r.w * r.h).toBeCloseTo(40000);
    expect(r.x + r.w / 2).toBeCloseTo(100);
    expect(r.y + r.h / 2).toBeCloseTo(100);
  });
});

describe('cardUvToImageUv', () => {
  it('is the identity when nothing is cropped', () => {
    expect(cardUvToImageUv(0.3, 0.6, { w: 200, h: 100 }, 2, { x: null, y: null })).toEqual({
      u: 0.3,
      v: 0.6,
    });
  });

  it('maps through the crop window', () => {
    // Square card on a 2:1 picture, focus 0: the card shows the left half.
    expect(cardUvToImageUv(1, 0.5, { w: 100, h: 100 }, 2, { x: 0, y: null })).toEqual({
      u: 0.5,
      v: 0.5,
    });
    expect(cardUvToImageUv(0.5, 0.5, { w: 100, h: 100 }, 2, { x: null, y: null }).u).toBe(0.5);
  });
});
