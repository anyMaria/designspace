import { describe, expect, it } from 'vitest';
import { newId } from './ids';

describe('newId', () => {
  it('generates 26-character, unique ULIDs', () => {
    const a = newId();
    const b = newId();
    expect(a).toHaveLength(26);
    expect(b).toHaveLength(26);
    expect(a).not.toBe(b);
  });

  it('sorts with creation order even for ids minted in the same millisecond, as a batch import does', () => {
    const ids = Array.from({ length: 200 }, () => newId());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});
