import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAddItemTermCommand,
  createBackToInboxCommand,
  createBulkAddTermCommand,
  createBulkRemoveTermCommand,
  createBulkSetTypeCommand,
  createRemoveItemTermCommand,
  createSetItemTypeCommand,
} from './itemTermCommands';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import type { Item, Term } from '@/state/types';
import type { Platform } from '@/platform/types';

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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: 't1',
    facet: 'type',
    name: 'Poster',
    nameNorm: 'poster',
    aiHint: null,
    sort: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePlatform(): Platform {
  return {
    db: {
      select: vi.fn<Platform['db']['select']>(),
      execute: vi.fn<Platform['db']['execute']>().mockResolvedValue({ changes: 1 }),
      batch: vi.fn<Platform['db']['batch']>().mockResolvedValue(undefined),
    },
  } as unknown as Platform;
}

beforeEach(() => {
  useLibraryStore.setState({ items: new Map(), placements: new Map(), selection: new Set() });
  useTermStore.setState({ terms: new Map(), itemTerms: new Map() });
});

describe('createSetItemTypeCommand', () => {
  it('links an existing type term, replaces a previous one, and marks the item sorted', async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 'old', name: 'Illustration' }),
        makeTerm({ id: 'new', name: 'Poster' }),
      ]);
    useTermStore.getState().addItemTerm('i1', 'old');
    const platform = makePlatform();

    const command = createSetItemTypeCommand(platform, 'i1', { id: 'new' });
    await command.do();

    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['new']));
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).not.toBeNull();

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['old']));
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
  });

  it('creates a new term by name and removes it on undo if nothing else uses it', async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    const platform = makePlatform();
    const command = createSetItemTypeCommand(platform, 'i1', { name: 'Collage' });

    await command.do();
    const created = [...useTermStore.getState().terms.values()].find((t) => t.name === 'Collage');
    expect(created).toBeDefined();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set([created!.id]));

    await command.undo();
    expect(useTermStore.getState().terms.has(created!.id)).toBe(false);
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
  });

  it("doesn't unmark sorted on undo if the item was already sorted before", async () => {
    useLibraryStore.getState().upsertItem(makeItem({ sortedAt: '2025-01-01T00:00:00.000Z' }));
    useTermStore.getState().upsertTerm(makeTerm());
    const platform = makePlatform();
    const command = createSetItemTypeCommand(platform, 'i1', { id: 't1' });

    await command.do();
    await command.undo();
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it("saves via = 'ai' when accepting an AI suggestion, and 'user' by default", async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    useTermStore.getState().upsertTerm(makeTerm());
    const platform = makePlatform();

    await createSetItemTypeCommand(platform, 'i1', { id: 't1' }, 'ai').do();
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO item_terms'),
      expect.arrayContaining(['ai']),
    );

    vi.mocked(platform.db.execute).mockClear();
    await createSetItemTypeCommand(platform, 'i1', { id: 't1' }).do();
    expect(platform.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO item_terms'),
      expect.arrayContaining(['user']),
    );
  });
});

describe('createAddItemTermCommand', () => {
  it('adds a vibe term alongside existing ones and marks the item sorted', async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' }),
        makeTerm({ id: 'v2', facet: 'vibe', name: 'Bold' }),
      ]);
    useTermStore.getState().addItemTerm('i1', 'v1');
    const platform = makePlatform();

    const command = createAddItemTermCommand(platform, 'i1', 'vibe', { id: 'v2' });
    await command.do();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['v1', 'v2']));
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).not.toBeNull();

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['v1']));
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
  });

  it('tags do not affect the sorted flag', async () => {
    useLibraryStore.getState().upsertItem(makeItem());
    const platform = makePlatform();
    const command = createAddItemTermCommand(platform, 'i1', 'tag', { name: 'dune' });

    await command.do();
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
  });
});

describe('createRemoveItemTermCommand', () => {
  it('unlinks a term and undo relinks it', async () => {
    useTermStore.getState().upsertTerm(makeTerm());
    useTermStore.getState().addItemTerm('i1', 't1');
    const platform = makePlatform();
    const command = createRemoveItemTermCommand(platform, 'i1', 't1');

    await command.do();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(false);

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(true);
  });
});

describe('createBulkSetTypeCommand', () => {
  it('sets the same Type on every item and marks each sorted, restoring per-item state on undo', async () => {
    useLibraryStore
      .getState()
      .upsertItems([
        makeItem({ id: 'i1' }),
        makeItem({ id: 'i2', sortedAt: '2025-01-01T00:00:00.000Z' }),
      ]);
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 'old', name: 'Illustration' }),
        makeTerm({ id: 'new', name: 'Poster' }),
      ]);
    useTermStore.getState().addItemTerm('i1', 'old');
    const platform = makePlatform();

    const command = createBulkSetTypeCommand(platform, ['i1', 'i2'], { id: 'new' });
    await command.do();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['new']));
    expect(useTermStore.getState().itemTerms.get('i2')).toEqual(new Set(['new']));
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).not.toBeNull();

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['old']));
    expect(useTermStore.getState().itemTerms.get('i2')).toEqual(new Set());
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
    expect(useLibraryStore.getState().items.get('i2')?.sortedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('createBulkAddTermCommand', () => {
  it('only links items that lacked the term, and undo only unlinks those', async () => {
    useLibraryStore.getState().upsertItems([makeItem({ id: 'i1' }), makeItem({ id: 'i2' })]);
    useTermStore.getState().upsertTerm(makeTerm({ id: 'v1', facet: 'vibe', name: 'Dreamy' }));
    useTermStore.getState().addItemTerm('i2', 'v1'); // i2 already has it
    const platform = makePlatform();

    const command = createBulkAddTermCommand(platform, ['i1', 'i2'], 'vibe', { id: 'v1' });
    await command.do();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('v1')).toBe(true);
    expect(useTermStore.getState().itemTerms.get('i2')?.has('v1')).toBe(true);
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).not.toBeNull();

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('v1')).toBe(false);
    expect(useTermStore.getState().itemTerms.get('i2')?.has('v1')).toBe(true); // still there — was pre-existing
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
  });
});

describe('createBulkRemoveTermCommand', () => {
  it('unlinks only items that had the term, and undo relinks exactly those', async () => {
    useTermStore.getState().upsertTerm(makeTerm({ id: 't1' }));
    useTermStore.getState().addItemTerm('i1', 't1');
    const platform = makePlatform();

    const command = createBulkRemoveTermCommand(platform, ['i1', 'i2'], 't1');
    await command.do();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(false);

    await command.undo();
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(true);
    expect(useTermStore.getState().itemTerms.get('i2')?.has('t1')).toBeFalsy();
  });
});

describe('createBackToInboxCommand', () => {
  it('clears sorted_at and undo restores the previous value', async () => {
    useLibraryStore
      .getState()
      .upsertItems([
        makeItem({ id: 'i1', sortedAt: '2025-01-01T00:00:00.000Z' }),
        makeItem({ id: 'i2' }),
      ]);
    const platform = makePlatform();

    const command = createBackToInboxCommand(platform, ['i1', 'i2']);
    await command.do();
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBeNull();
    expect(useLibraryStore.getState().items.get('i2')?.sortedAt).toBeNull();

    await command.undo();
    expect(useLibraryStore.getState().items.get('i1')?.sortedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(useLibraryStore.getState().items.get('i2')?.sortedAt).toBeNull();
  });
});
