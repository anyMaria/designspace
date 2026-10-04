import { describe, expect, it } from 'vitest';
import {
  rowToItem,
  rowToItemTerm,
  rowToManualConnection,
  rowToPlacement,
  rowToTerm,
} from './rowMapping';

describe('rowToItem', () => {
  it('maps the Patch 1 columns, with safe defaults', () => {
    const base = {
      id: 'i',
      kind: 'swatch',
      title: '',
      status: 'ok',
      created_at: 'x',
      updated_at: 'x',
    };
    const filled = rowToItem({
      ...base,
      swatch_colors: '[{"hex":"#AABBCC","name":"Sky"}]',
      description: '{"type":"doc"}',
      description_text: 'hello',
      thumb_v: 3,
    });
    expect(filled.swatchColors).toEqual([{ hex: '#AABBCC', name: 'Sky' }]);
    expect(filled.description).toEqual({ type: 'doc' });
    expect(filled.descriptionText).toBe('hello');
    expect(filled.thumbV).toBe(3);

    const empty = rowToItem(base);
    expect(empty.swatchColors).toBeNull();
    expect(empty.descriptionText).toBeNull();
    expect(empty.thumbV).toBe(0);
  });

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
      body: null,
      body_text: null,
      color: null,
      origin_board_id: null,
      duration_ms: null,
      poster_ms: null,
      page_count: null,
      cover_page: null,
      font_meta: null,
      url: null,
      cover_path: null,
      link_meta: null,
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
      body: null,
      bodyText: null,
      swatchColors: null,
      description: null,
      descriptionText: null,
      thumbV: 0,
      color: null,
      originBoardId: null,
      durationMs: null,
      posterMs: null,
      pageCount: null,
      coverPage: null,
      fontMeta: null,
      url: null,
      coverPath: null,
      linkMeta: null,
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

describe('rowToPlacement crop columns', () => {
  const base = { board_id: 'b', item_id: 'i', x: 0, y: 0, w: 1, h: 1, z: 0, added_at: 'x' };
  it('maps crop_x / crop_y, and null when unset', () => {
    expect(rowToPlacement({ ...base, crop_x: 0.25, crop_y: 0.75 })).toMatchObject({
      cropX: 0.25,
      cropY: 0.75,
    });
    expect(rowToPlacement({ ...base, crop_x: null, crop_y: null })).toMatchObject({
      cropX: null,
      cropY: null,
    });
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
      cropX: null,
      cropY: null,
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
