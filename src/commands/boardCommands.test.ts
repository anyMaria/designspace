import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCreateBoardCommand,
  createRenameBoardCommand,
  createDuplicateBoardCommand,
  createDeleteBoardCommand,
  createRestoreBoardCommand,
} from './boardCommands';
import { useBoardStore } from '@/state/boardStore';
import type { Platform } from '@/platform/types';

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>().mockResolvedValue([]),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

beforeEach(() => {
  useBoardStore.setState({ boards: new Map(), currentBoardId: null });
});

describe('createCreateBoardCommand', () => {
  it('adds a board row and removes it on undo', async () => {
    const platform = makePlatform();
    const { command, board } = createCreateBoardCommand(platform, 'Moodboard 1');

    await command.do();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('Moodboard 1');
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO boards'),
      expect.arrayContaining([board.id, 'Moodboard 1']),
    );

    await command.undo();
    expect(useBoardStore.getState().boards.has(board.id)).toBe(false);
  });
});

describe('createRenameBoardCommand', () => {
  it('renames a board and restores the previous name on undo', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Old name');
    await create.do();

    const rename = createRenameBoardCommand(platform, board.id, 'New name');
    await rename.do();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('New name');

    await rename.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.name).toBe('Old name');
  });
});

describe('createDuplicateBoardCommand', () => {
  it('creates a copy with its own id and removes it on undo', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'Original');
    await create.do();

    const { command, board: copy } = createDuplicateBoardCommand(
      platform,
      board.id,
      'Original copy',
    );
    await command.do();
    expect(copy.id).not.toBe(board.id);
    expect(useBoardStore.getState().boards.get(copy.id)?.name).toBe('Original copy');
    expect(platform.db.select).toHaveBeenCalledWith(expect.stringContaining('FROM frames'), [
      board.id,
    ]);
    expect(platform.db.select).toHaveBeenCalledWith(expect.stringContaining('FROM placements'), [
      board.id,
    ]);

    await command.undo();
    expect(useBoardStore.getState().boards.has(copy.id)).toBe(false);
  });
});

describe('createDeleteBoardCommand / createRestoreBoardCommand', () => {
  it('soft-deletes a board and undo brings it back', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'To trash');
    await create.do();

    const del = createDeleteBoardCommand(platform, board.id);
    await del.do();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).not.toBeNull();

    await del.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).toBeNull();
  });

  it('restore command clears deleted_at and undo re-deletes it', async () => {
    const platform = makePlatform();
    const { command: create, board } = createCreateBoardCommand(platform, 'To trash');
    await create.do();
    await createDeleteBoardCommand(platform, board.id).do();

    const restore = createRestoreBoardCommand(platform, board.id);
    await restore.do();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).toBeNull();

    await restore.undo();
    expect(useBoardStore.getState().boards.get(board.id)?.deletedAt).not.toBeNull();
  });
});
