import { describe, expect, it } from 'vitest';
import { wrapLines } from './fontRender';

const measure = (s: string) => s.length * 10; // every character is 10 px wide

describe('wrapLines', () => {
  it('keeps short text on one line', () => {
    expect(wrapLines(measure, 'Hello world', 200, 2)).toEqual(['Hello world']);
  });
  it('breaks at spaces onto a second line', () => {
    expect(wrapLines(measure, 'sphinx of black quartz', 120, 2)).toEqual([
      'sphinx of',
      'black quartz',
    ]);
  });
  it('ends the last line with an ellipsis when the text does not fit', () => {
    const out = wrapLines(measure, 'one two three four five six seven', 100, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith('…')).toBe(true);
    for (const l of out) expect(measure(l)).toBeLessThanOrEqual(100);
  });
  it('cuts a word that is wider than a line', () => {
    const out = wrapLines(measure, 'Supercalifragilistic', 100, 3);
    expect(out[0].length).toBe(10);
    for (const l of out) expect(measure(l)).toBeLessThanOrEqual(100);
  });
  it('returns nothing for empty text or zero lines', () => {
    expect(wrapLines(measure, '   ', 100, 2)).toEqual([]);
    expect(wrapLines(measure, 'x', 100, 0)).toEqual([]);
  });
});
