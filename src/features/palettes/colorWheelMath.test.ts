import { describe, expect, it } from 'vitest';
import { hsvToRgb, wheelHueSat, wheelPoint } from './colorWheelMath';

describe('hsvToRgb', () => {
  it('gives the primaries and secondaries', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);
    expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
    expect(hsvToRgb(60, 1, 1)).toEqual([255, 255, 0]);
  });
  it('gives greys when saturation is 0, and black when value is 0', () => {
    expect(hsvToRgb(200, 0, 0.5)).toEqual([128, 128, 128]);
    expect(hsvToRgb(200, 1, 0)).toEqual([0, 0, 0]);
  });
  it('wraps hue', () => {
    expect(hsvToRgb(360, 1, 1)).toEqual(hsvToRgb(0, 1, 1));
    expect(hsvToRgb(-120, 1, 1)).toEqual(hsvToRgb(240, 1, 1));
  });
});

describe('wheel geometry', () => {
  it('puts hue 0° at 3 o’clock and 90° at 12 o’clock', () => {
    const east = wheelPoint(0, 1, 100);
    expect(east.x).toBeCloseTo(100);
    expect(east.y).toBeCloseTo(50);
    const north = wheelPoint(90, 1, 100);
    expect(north.x).toBeCloseTo(50);
    expect(north.y).toBeCloseTo(0);
  });
  it('the centre is saturation 0', () => {
    const p = wheelPoint(123, 0, 100);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(50);
  });
  it('round-trips (h, s) through a point', () => {
    for (const [h, s] of [
      [10, 0.3],
      [200, 0.9],
      [300, 0.55],
    ]) {
      const p = wheelPoint(h, s, 120);
      const back = wheelHueSat(p.x, p.y, 120);
      expect(back.h).toBeCloseTo(h, 5);
      expect(back.s).toBeCloseTo(s, 5);
    }
  });
  it('clamps saturation outside the disc', () => {
    expect(wheelHueSat(500, 60, 120).s).toBe(1);
  });
});
