import { describe, expect, it } from 'vitest';
import { collectActions } from './actions';
import type { Item } from '@/state/types';

const note = (id: string, bodyText: string, updatedAt: string, extra: Partial<Item> = {}): Item =>
  ({ id, kind: 'note', bodyText, updatedAt, deletedAt: null, ...extra }) as Item;

describe('collectActions', () => {
  it('groups by tag A–Z, newest item first inside a group', () => {
    const groups = collectActions([
      note('a', 'call #zeta', '2026-01-01'),
      note('b', 'dig #alpha\nand #zeta too', '2026-02-01'),
    ]);
    expect(groups.map((g) => g.tag)).toEqual(['alpha', 'zeta']);
    expect(groups[1].entries.map((e) => e.itemId)).toEqual(['b', 'a']);
    expect(groups[1].entries[0].line).toBe('and #zeta too');
  });

  it('reads descriptions too, and ignores trashed items and non-notes’ bodies', () => {
    const groups = collectActions([
      {
        id: 'i',
        kind: 'image',
        descriptionText: 'see #later',
        updatedAt: 'x',
        deletedAt: null,
      } as Item,
      note('gone', '#hidden', 'x', { deletedAt: '2026-01-01' }),
      { id: 'sw', kind: 'swatch', bodyText: '#nope', updatedAt: 'x', deletedAt: null } as Item,
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ tag: 'later' });
    expect(groups[0].entries[0].source).toBe('description');
  });

  it('is empty when nothing is tagged', () => {
    expect(collectActions([note('a', 'plain text', 'x')])).toEqual([]);
  });
});
