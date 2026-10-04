import { describe, expect, it } from 'vitest';
import { itemToCard } from './itemCards';
import type { Item, Placement } from '@/state/types';
import type { Platform } from '@/platform/types';

const platform = {
  cache: { url: (key: string) => `media://cache/${key}` },
  media: { originalUrl: (p: string) => `media://original/${p}` },
} as unknown as Platform;

const placement: Placement = {
  boardId: 'lib',
  itemId: 'l1',
  x: 0,
  y: 0,
  w: 320,
  h: 320,
  z: 0,
  frameId: null,
  cropX: null,
  cropY: null,
  parentId: null,
  addedAt: '2026-01-01T00:00:00.000Z',
};

function link(overrides: Partial<Item>): Item {
  return {
    id: 'l1',
    kind: 'link',
    title: 'A page',
    url: 'https://www.example.com/post',
    coverPath: 'media/2026/10/cover.jpg',
    status: 'pending',
    palette: null,
    ...overrides,
  } as Item;
}

describe('itemToCard (links)', () => {
  it('shows the site and title while the cover is still loading', () => {
    const card = itemToCard(link({ status: 'pending' }), placement, platform);
    expect(card.noteText).toContain('example.com');
    expect(card.noteText).toContain('A page');
    expect(card.thumbUrl128).toBeNull();
  });

  it('hides the text once the cover is ready', () => {
    const card = itemToCard(link({ status: 'ok' }), placement, platform);
    expect(card.noteText).toBeNull();
    expect(card.thumbUrl128).toBe('media://cache/t128/l1');
  });
});

describe('itemToCard (favourites and crop)', () => {
  it('carries the favourite flag and the crop focus', () => {
    const card = itemToCard(
      link({ status: 'ok', favorite: true }),
      { ...placement, cropX: 0.25, cropY: 0.75 },
      platform,
    );
    expect(card.favorite).toBe(true);
    expect(card).toMatchObject({ cropX: 0.25, cropY: 0.75 });
    expect(itemToCard(link({ status: 'ok', favorite: false }), placement, platform).favorite).toBe(
      false,
    );
  });
});
