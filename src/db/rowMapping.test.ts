import { describe, expect, it } from 'vitest';
import {
  rowToItem,
  rowToItemTerm,
  rowToManualConnection,
  rowToPlacement,
  rowToTerm,
} from './rowMapping';

describe('rowToItem', () => {
  it('maps a full row', () => {
    const item = rowToItem({
      id: 'i1',
      kind: 'image',
      title: 'Poster',
      file_path: 'media/2026/09/poster-abc123.jpg',
      file_name: 'poster.jpg',
      file_hash: 'deadbeef',
      file_size: 12345,
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      artist: null,
      source_url: null,
      why: null,
      palette: '[{"hex":"#e9a845","weight":0.5}]',
      color_families: '["orange"]',
      phash: '0'.repeat(16),
      favorite: 1,
      sorted_at: null,
      viewed_at: null,
      status: 'ok',
      derived_v: 1,
      created_at: '2026-09-27T00:00:00.000Z',
      updated_at: '2026-09-27T00:00:00.000Z',
      deleted_at: null,
    });

    expect(item).toEqual({
      id: 'i1',
      kind: 'image',
      title: 'Poster',
      filePath: 'media/2026/09/poster-abc123.jpg',
      fileName: 'poster.jpg',
      fileHash: 'deadbeef',
      fileSize: 12345,
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      artist: null,
      sourceUrl: null,
      why: null,
      palette: [{ hex: '#e9a845', weight: 0.5 }],
      colorFamilies: ['orange'],
      phash: '0'.repeat(16),
      favorite: true,
      sortedAt: null,
      viewedAt: null,
      status: 'ok',
      derivedV: 1,
      createdAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
      deletedAt: null,
    });
  });

  it('tolerates malformed JSON columns by returning null', () => {
    const item = rowToItem({
      id: 'i1',
      kind: 'image',
      title: '',
      palette: 'not json',
      color_families: null,
      favorite: 0,
      status: 'pending',
      created_at: '',
      updated_at: '',
    });
    expect(item.palette).toBeNull();
    expect(item.colorFamilies).toBeNull();
    expect(item.favorite).toBe(false);
  });
});

describe('rowToPlacement', () => {
  it('maps a placement row', () => {
    const placement = rowToPlacement({
      board_id: 'b1',
      item_id: 'i1',
      x: 10,
      y: 20,
      w: 320,
      h: 240,
      z: 3,
      frame_id: null,
      added_at: '2026-09-27T00:00:00.000Z',
    });
    expect(placement).toEqual({
      boardId: 'b1',
      itemId: 'i1',
      x: 10,
      y: 20,
      w: 320,
      h: 240,
      z: 3,
      frameId: null,
      addedAt: '2026-09-27T00:00:00.000Z',
    });
  });
});

describe('rowToTerm', () => {
  it('maps a term row', () => {
    const term = rowToTerm({
      id: 't1',
      facet: 'vibe',
      name: 'Dreamy',
      name_norm: 'dreamy',
      ai_hint: null,
      sort: 0,
      created_at: '2026-09-27T00:00:00.000Z',
    });
    expect(term).toEqual({
      id: 't1',
      facet: 'vibe',
      name: 'Dreamy',
      nameNorm: 'dreamy',
      aiHint: null,
      sort: 0,
      createdAt: '2026-09-27T00:00:00.000Z',
    });
  });
});

describe('rowToItemTerm', () => {
  it('maps an item_term row', () => {
    const itemTerm = rowToItemTerm({
      item_id: 'i1',
      term_id: 't1',
      via: 'user',
      added_at: '2026-09-27T00:00:00.000Z',
    });
    expect(itemTerm).toEqual({
      itemId: 'i1',
      termId: 't1',
      via: 'user',
      addedAt: '2026-09-27T00:00:00.000Z',
    });
  });
});

describe('rowToManualConnection', () => {
  it('maps a manual_connections row', () => {
    const connection = rowToManualConnection({
      id: 'c1',
      from_id: 'i1',
      to_id: 'i2',
      label: 'same typography',
      created_at: '2026-09-27T00:00:00.000Z',
    });
    expect(connection).toEqual({
      id: 'c1',
      fromId: 'i1',
      toId: 'i2',
      label: 'same typography',
      createdAt: '2026-09-27T00:00:00.000Z',
    });
  });

  it('maps a null label', () => {
    const connection = rowToManualConnection({
      id: 'c1',
      from_id: 'i1',
      to_id: 'i2',
      label: null,
      created_at: '2026-09-27T00:00:00.000Z',
    });
    expect(connection.label).toBeNull();
  });
});
