import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLACEHOLDER_SIZE, fitPlacementsToAspect, fitRect } from './fitPlacements';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { Placement } from '@/state/types';

describe('fitRect', () => {
  it('shrinks the short side of a landscape picture and re-centres it', () => {
    expect(fitRect(2)).toEqual({ w: 320, h: 160, dx: 0, dy: 80 });
  });
  it('shrinks the short side of a portrait picture and re-centres it', () => {
    expect(fitRect(0.5)).toEqual({ w: 160, h: 320, dx: 80, dy: 0 });
  });
  it('leaves a square alone', () => {
    expect(fitRect(1)).toEqual({ w: 320, h: 320, dx: 0, dy: 0 });
  });
});

function makePlatform(rows: { board_id: string }[]) {
  const db = {
    select: vi.fn().mockResolvedValue(rows),
    batch: vi.fn().mockResolvedValue(undefined),
  };
  return { platform: { db } as unknown as Platform, db };
}

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    boardId: 'lib',
    itemId: 'i1',
    x: 100,
    y: 100,
    w: PLACEHOLDER_SIZE,
    h: PLACEHOLDER_SIZE,
    z: 0,
    frameId: null,
    cropX: null,
    cropY: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('fitPlacementsToAspect', () => {
  beforeEach(() => {
    useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  });

  it('reshapes untouched 320×320 placements in one batch and updates the store', async () => {
    const { platform, db } = makePlatform([{ board_id: 'lib' }, { board_id: 'b2' }]);
    useLibraryStore.setState({ placements: new Map([['i1', placement()]]) });

    await fitPlacementsToAspect(platform, 'i1', 2);

    expect(db.select).toHaveBeenCalledWith(expect.stringContaining('w = ? AND h = ?'), [
      'i1',
      320,
      320,
    ]);
    expect(db.batch).toHaveBeenCalledTimes(1);
    const statements = db.batch.mock.calls[0]?.[0] as { params: unknown[] }[];
    expect(statements).toHaveLength(2);
    expect(statements[0]?.params).toEqual([0, 80, 320, 160, 'lib', 'i1']);
    expect(useLibraryStore.getState().placements.get('i1')).toMatchObject({
      x: 100,
      y: 180,
      w: 320,
      h: 160,
    });
  });

  it('leaves a placement the owner already resized alone', async () => {
    const { platform, db } = makePlatform([]); // the query only returns untouched 320×320 rows
    const resized = placement({ w: 500, h: 400 });
    useLibraryStore.setState({ placements: new Map([['i1', resized]]) });

    await fitPlacementsToAspect(platform, 'i1', 2);

    expect(db.batch).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().placements.get('i1')).toEqual(resized);
  });

  it('ignores non-finite or non-positive aspects', async () => {
    const { platform, db } = makePlatform([{ board_id: 'lib' }]);
    for (const aspect of [NaN, Infinity, 0, -1])
      await fitPlacementsToAspect(platform, 'i1', aspect);
    expect(db.select).not.toHaveBeenCalled();
  });
});
