import { describe, expect, it } from 'vitest';
import { newId } from './ids';

describe('newId', () => {
  it('generates 26-character ULIDs that sort with creation order', () => {
    const a = newId();
    const b = newId();
    expect(a).toHaveLength(26);
    expect(b).toHaveLength(26);
    expect(a).not.toBe(b);
    expect(a <= b).toBe(true);
  });
});
