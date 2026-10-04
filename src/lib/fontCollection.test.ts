import { describe, expect, it } from 'vitest';
import { fontCollectionRows, fontCollectionSize } from './fontCollection';

describe('fontCollection geometry', () => {
  it('is 360 wide, 48 of header, 56 per family and 8 at the bottom', () => {
    expect(fontCollectionSize(0)).toEqual({ w: 360, h: 56 });
    expect(fontCollectionSize(3)).toEqual({ w: 360, h: 48 + 168 + 8 });
  });
  it('lays the rows out under the header, in order', () => {
    expect(fontCollectionRows(2, { x: 10, y: 100 })).toEqual([
      { x: 10, y: 148, w: 360, h: 56 },
      { x: 10, y: 204, w: 360, h: 56 },
    ]);
  });
});
