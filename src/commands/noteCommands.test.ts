import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateNoteCommand, createSaveNoteBodyCommand } from './noteCommands';
import { useLibraryStore } from '@/state/libraryStore';
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
  useLibraryStore.setState({ items: new Map(), placements: new Map() });
});

describe('createCreateNoteCommand', () => {
  it('creates a note item + placement centered on the given point, and undo removes it', async () => {
    const platform = makePlatform();
    const { command, item } = createCreateNoteCommand(
      platform,
      'board-1',
      true,
      500,
      500,
      '',
      'cream',
    );

    await command.do();
    expect(useLibraryStore.getState().items.get(item.id)?.kind).toBe('note');
    expect(useLibraryStore.getState().items.get(item.id)?.originBoardId).toBeNull();
    const placement = useLibraryStore.getState().placements.get(item.id);
    expect(placement?.boardId).toBe('board-1');
    // Centered on (500, 500): x/y are the top-left corner of a square note.
    expect(placement!.x + placement!.w / 2).toBeCloseTo(500);
    expect(placement!.y + placement!.h / 2).toBeCloseTo(500);
    expect(platform.db.batch).toHaveBeenCalledTimes(1);

    await command.undo();
    expect(useLibraryStore.getState().items.has(item.id)).toBe(false);
  });

  it('sets originBoardId to the board when created off the Library map', async () => {
    const platform = makePlatform();
    const { command, item } = createCreateNoteCommand(platform, 'board-2', false, 0, 0, '', 'sage');
    await command.do();
    expect(useLibraryStore.getState().items.get(item.id)?.originBoardId).toBe('board-2');
  });

  it('seeds the body from initialText (pasted text becomes a note)', async () => {
    const platform = makePlatform();
    const { command, item } = createCreateNoteCommand(
      platform,
      'board-1',
      true,
      0,
      0,
      'Pasted words',
      'cream',
    );
    await command.do();
    expect(useLibraryStore.getState().items.get(item.id)?.bodyText).toBe('Pasted words');
  });
});

describe('createSaveNoteBodyCommand', () => {
  it('saves body/bodyText and undo restores the previous content', async () => {
    const platform = makePlatform();
    const { command: create, item } = createCreateNoteCommand(
      platform,
      'board-1',
      true,
      0,
      0,
      '',
      'cream',
    );
    await create.do();

    const newBody = { type: 'doc', content: [{ type: 'paragraph' }] };
    const save = createSaveNoteBodyCommand(platform, item.id, newBody, 'new text');
    await save.do();
    expect(useLibraryStore.getState().items.get(item.id)?.bodyText).toBe('new text');

    await save.undo();
    expect(useLibraryStore.getState().items.get(item.id)?.bodyText).toBe('');
  });
});
