import { describe, expect, it } from 'vitest';
import { fitWithin } from './imagePixels';

describe('fitWithin', () => {
  it('scales the long side down to the maximum, keeping the proportions', () => {
    expect(fitWithin(2000, 1000, 512)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(600, 1200, 512)).toEqual({ width: 256, height: 512 });
  });

  it('never scales up, and handles empty input', () => {
    expect(fitWithin(100, 50, 512)).toEqual({ width: 100, height: 50 });
    expect(fitWithin(0, 50, 512)).toEqual({ width: 0, height: 0 });
  });
});
