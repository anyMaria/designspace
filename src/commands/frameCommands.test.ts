import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCreateFrameCommand,
  createRenameFrameCommand,
  createMoveFrameCommand,
  createResizeFrameCommand,
  createDeleteFrameCommand,
} from './frameCommands';
import { useFrameStore } from '@/state/frameStore';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { Placement } from '@/state/types';

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

function makePlacement(itemId: string, frameId: string | null, x = 0, y = 0): Placement {
  return {
    boardId: 'board-1',
    itemId,
    x,
    y,
    w: 100,
    h: 100,
    z: 0,
    frameId,
    addedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  useFrameStore.setState({ frames: new Map() });
  useLibraryStore.setState({ placements: new Map() });
});

describe('createCreateFrameCommand', () => {
  it('creates a default-sized frame centered on the given point, and undo removes it', async () => {
    const platform = makePlatform();
    const { command, frame } = createCreateFrameCommand(platform, 'board-1', 500, 500);

    await command.do();
    expect(useFrameStore.getState().frames.get(frame.id)?.title).toBe('Frame');
    expect(frame.x + frame.w / 2).toBeCloseTo(500);
    expect(frame.y + frame.h / 2).toBeCloseTo(500);
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO frames'),
      expect.arrayContaining([frame.id]),
    );

    await command.undo();
    expect(useFrameStore.getState().frames.has(frame.id)).toBe(false);
  });
});

describe('createRenameFrameCommand', () => {
  it('renames and undo restores the previous title', async () => {
    const platform = makePlatform();
    const { command: create, frame } = createCreateFrameCommand(platform, 'board-1', 0, 0);
    await create.do();

    const rename = createRenameFrameCommand(platform, frame.id, 'Moodboard row 1');
    await rename.do();
    expect(useFrameStore.getState().frames.get(frame.id)?.title).toBe('Moodboard row 1');

    await rename.undo();
    expect(useFrameStore.getState().frames.get(frame.id)?.title).toBe('Frame');
  });
});

describe('createMoveFrameCommand', () => {
  it('moves the frame and every placement whose frameId points at it, by the same delta', async () => {
    const platform = makePlatform();
    const { command: create, frame } = createCreateFrameCommand(platform, 'board-1', 0, 0);
    await create.do();
    useLibraryStore.setState({
      placements: new Map([
        ['a', makePlacement('a', frame.id, 10, 10)],
        ['b', makePlacement('b', frame.id, 50, 50)],
        ['c', makePlacement('c', null, 200, 200)], // not a member — must stay put
      ]),
    });

    const move = createMoveFrameCommand(platform, frame.id, 30, 40);
    await move.do();
    expect(useFrameStore.getState().frames.get(frame.id)?.x).toBeCloseTo(frame.x + 30);
    expect(useFrameStore.getState().frames.get(frame.id)?.y).toBeCloseTo(frame.y + 40);
    expect(useLibraryStore.getState().placements.get('a')).toMatchObject({ x: 40, y: 50 });
    expect(useLibraryStore.getState().placements.get('b')).toMatchObject({ x: 80, y: 90 });
    expect(useLibraryStore.getState().placements.get('c')).toMatchObject({ x: 200, y: 200 });

    await move.undo();
    expect(useFrameStore.getState().frames.get(frame.id)?.x).toBeCloseTo(frame.x);
    expect(useLibraryStore.getState().placements.get('a')).toMatchObject({ x: 10, y: 10 });
  });
});

describe('createResizeFrameCommand', () => {
  it('resizes the frame rect and undo restores the previous rect', async () => {
    const platform = makePlatform();
    const { command: create, frame } = createCreateFrameCommand(platform, 'board-1', 0, 0);
    await create.do();

    const resize = createResizeFrameCommand(platform, frame.id, {
      x: frame.x,
      y: frame.y,
      w: 600,
      h: 500,
    });
    await resize.do();
    expect(useFrameStore.getState().frames.get(frame.id)?.w).toBe(600);

    await resize.undo();
    expect(useFrameStore.getState().frames.get(frame.id)?.w).toBe(frame.w);
  });
});

describe('createDeleteFrameCommand', () => {
  it('deletes the frame and un-parents its member placements; undo restores both', async () => {
    const platform = makePlatform();
    const { command: create, frame } = createCreateFrameCommand(platform, 'board-1', 0, 0);
    await create.do();
    useLibraryStore.setState({
      placements: new Map([['a', makePlacement('a', frame.id)]]),
    });

    const del = createDeleteFrameCommand(platform, frame.id);
    await del.do();
    expect(useFrameStore.getState().frames.has(frame.id)).toBe(false);
    expect(useLibraryStore.getState().placements.get('a')?.frameId).toBeNull();

    await del.undo();
    expect(useFrameStore.getState().frames.has(frame.id)).toBe(true);
    expect(useLibraryStore.getState().placements.get('a')?.frameId).toBe(frame.id);
  });
});
