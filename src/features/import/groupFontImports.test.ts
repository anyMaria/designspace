import { describe, expect, it } from 'vitest';
import { groupFontImports } from './groupFontImports';

const e = (index: number, key: string, vendorId: string | null = null) => ({
  index,
  key,
  vendorId,
});

describe('groupFontImports', () => {
  it('puts files of the same family in one batch into one group', () => {
    expect(groupFontImports([e(0, 'urbanist'), e(1, 'urbanist')], new Map())).toEqual([
      { kind: 'new', groupIndex: 0 },
      { kind: 'new', groupIndex: 0 },
    ]);
  });
  it('joins a family that already exists in the library', () => {
    expect(
      groupFontImports([e(0, 'urbanist'), e(1, 'inter')], new Map([['urbanist', 'item-1']])),
    ).toEqual([
      { kind: 'existing', itemId: 'item-1' },
      { kind: 'new', groupIndex: 0 },
    ]);
  });
  it('two different families make two groups', () => {
    expect(groupFontImports([e(0, 'a'), e(1, 'b'), e(2, 'a')], new Map())).toEqual([
      { kind: 'new', groupIndex: 0 },
      { kind: 'new', groupIndex: 1 },
      { kind: 'new', groupIndex: 0 },
    ]);
  });
  it('different real vendor ids stay apart; unreadable files never join', () => {
    expect(groupFontImports([e(0, 'a', 'XXXX'), e(1, 'a', 'YYYY')], new Map())).toEqual([
      { kind: 'new', groupIndex: 0 },
      { kind: 'new', groupIndex: 1 },
    ]);
    expect(groupFontImports([e(0, ''), e(1, '')], new Map())).toEqual([
      { kind: 'new', groupIndex: 0 },
      { kind: 'new', groupIndex: 1 },
    ]);
  });
});
