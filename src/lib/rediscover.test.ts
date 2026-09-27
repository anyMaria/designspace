import { describe, expect, it } from 'vitest';
import { pickRediscoverItem } from './rediscover';
import type { Item } from '@/state/types';

const NOW = new Date('2026-09-27T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    kind: 'image',
    title: 'Test',
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: null,
    viewedAt: null,
    status: 'ok',
    derivedV: 1,
    createdAt: new Date(NOW - 60 * DAY).toISOString(),
    updatedAt: new Date(NOW - 60 * DAY).toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

describe('pickRediscoverItem', () => {
  it('returns null when nothing qualifies (all viewed recently)', () => {
    const items = [makeItem({ id: 'a', viewedAt: new Date(NOW - DAY).toISOString() })];
    expect(pickRediscoverItem(items, NOW)).toBeNull();
  });

  it('excludes items viewed within the last 30 days', () => {
    const items = [
      makeItem({ id: 'a', viewedAt: new Date(NOW - 10 * DAY).toISOString() }),
      makeItem({ id: 'b', viewedAt: new Date(NOW - 40 * DAY).toISOString() }),
    ];
    const picked = pickRediscoverItem(items, NOW, () => 0.5);
    expect(picked?.id).toBe('b');
  });

  it('falls back to createdAt for an item that was never viewed', () => {
    const items = [
      makeItem({ id: 'a', viewedAt: null, createdAt: new Date(NOW - 90 * DAY).toISOString() }),
    ];
    expect(pickRediscoverItem(items, NOW)?.id).toBe('a');
  });

  it('excludes soft-deleted items even if otherwise eligible', () => {
    const items = [
      makeItem({
        id: 'a',
        deletedAt: new Date().toISOString(),
        viewedAt: new Date(NOW - 60 * DAY).toISOString(),
      }),
    ];
    expect(pickRediscoverItem(items, NOW)).toBeNull();
  });

  it('favors older (staler) items — a fully-stale-favoring random draw picks the oldest', () => {
    const items = [
      makeItem({ id: 'a', viewedAt: new Date(NOW - 31 * DAY).toISOString() }), // barely eligible
      makeItem({ id: 'b', viewedAt: new Date(NOW - 400 * DAY).toISOString() }), // very stale
    ];
    // random() close to 1 lands in the largest weight bucket — the staler item.
    expect(pickRediscoverItem(items, NOW, () => 0.999)?.id).toBe('b');
  });

  it('is deterministic for a given random() implementation', () => {
    const items = [
      makeItem({ id: 'a', viewedAt: new Date(NOW - 40 * DAY).toISOString() }),
      makeItem({ id: 'b', viewedAt: new Date(NOW - 50 * DAY).toISOString() }),
      makeItem({ id: 'c', viewedAt: new Date(NOW - 60 * DAY).toISOString() }),
    ];
    const first = pickRediscoverItem(items, NOW, () => 0.3);
    const second = pickRediscoverItem(items, NOW, () => 0.3);
    expect(first?.id).toBe(second?.id);
  });
});
