import { describe, expect, it } from 'vitest';
import { formatPageRange, parsePageRange } from './pageRange';

describe('parsePageRange', () => {
  it('reads numbers and ranges', () => {
    expect(parsePageRange('1-3, 7', 10)).toEqual([0, 1, 2, 6]);
    expect(parsePageRange(' 2 ,4 - 5 ', 10)).toEqual([1, 3, 4]);
  });
  it('accepts a backwards range and removes duplicates', () => {
    expect(parsePageRange('5-3', 10)).toEqual([2, 3, 4]);
    expect(parsePageRange('1, 1-2', 5)).toEqual([0, 1]);
  });
  it('empty text is no pages', () => {
    expect(parsePageRange('', 5)).toEqual([]);
    expect(parsePageRange('   ', 5)).toEqual([]);
  });
  it('anything out of range or not a range is null', () => {
    expect(parsePageRange('0', 5)).toBeNull();
    expect(parsePageRange('6', 5)).toBeNull();
    expect(parsePageRange('1-9', 5)).toBeNull();
    expect(parsePageRange('a', 5)).toBeNull();
    expect(parsePageRange('1,,2', 5)).toBeNull();
    expect(parsePageRange('1-', 5)).toBeNull();
  });
});

describe('formatPageRange', () => {
  it('joins runs and keeps singles', () => {
    expect(formatPageRange([0, 1, 2, 6])).toBe('1-3, 7');
    expect(formatPageRange([4])).toBe('5');
    expect(formatPageRange([])).toBe('');
  });
  it('round-trips', () => {
    const idx = [0, 2, 3, 4, 8];
    expect(parsePageRange(formatPageRange(idx), 10)).toEqual(idx);
  });
});
