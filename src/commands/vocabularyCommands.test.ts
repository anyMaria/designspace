import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeleteTermCommand,
  createMergeTermsCommand,
  createMoveTermCommand,
  createReorderTermsCommand,
  createRenameTermCommand,
  createSetAiHintCommand,
} from './vocabularyCommands';
import { useTermStore } from '@/state/termStore';
import type { Term } from '@/state/types';
import type { Platform } from '@/platform/types';

function makeTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: 't1',
    facet: 'vibe',
    name: 'Dreamy',
    nameNorm: 'dreamy',
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
  useTermStore.setState({ terms: new Map(), itemTerms: new Map() });
});

describe('createRenameTermCommand', () => {
  it('do()/undo() round-trip the name', async () => {
    useTermStore.getState().upsertTerm(makeTerm());
    const platform = makePlatform();
    const command = createRenameTermCommand(platform, 't1', 'Reveur');

    await command.do();
    expect(useTermStore.getState().terms.get('t1')).toMatchObject({
      name: 'Reveur',
      nameNorm: 'reveur',
    });

    await command.undo();
    expect(useTermStore.getState().terms.get('t1')).toMatchObject({
      name: 'Dreamy',
      nameNorm: 'dreamy',
    });
  });
});

describe('createSetAiHintCommand', () => {
  it('do()/undo() round-trip the AI hint', async () => {
    useTermStore.getState().upsertTerm(makeTerm({ aiHint: null }));
    const platform = makePlatform();
    const command = createSetAiHintCommand(platform, 't1', 'a dreamy image');

    await command.do();
    expect(useTermStore.getState().terms.get('t1')?.aiHint).toBe('a dreamy image');

    await command.undo();
    expect(useTermStore.getState().terms.get('t1')?.aiHint).toBeNull();
  });
});

describe('createDeleteTermCommand', () => {
  it('removes the term and its item links, and undo restores both exactly', async () => {
    useTermStore.getState().upsertTerm(makeTerm());
    useTermStore.getState().addItemTerm('i1', 't1');
    useTermStore.getState().addItemTerm('i2', 't1');
    const platform = makePlatform();
    const command = createDeleteTermCommand(platform, 't1');

    await command.do();
    expect(useTermStore.getState().terms.has('t1')).toBe(false);
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(false);

    await command.undo();
    expect(useTermStore.getState().terms.get('t1')).toMatchObject({ name: 'Dreamy' });
    expect(useTermStore.getState().itemTerms.get('i1')?.has('t1')).toBe(true);
    expect(useTermStore.getState().itemTerms.get('i2')?.has('t1')).toBe(true);
  });
});

describe('createMergeTermsCommand', () => {
  it('repoints items that only had the source, drops the source term, and undo restores exactly', async () => {
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 'src', name: 'Reveur' }),
        makeTerm({ id: 'dst', name: 'Dreamy' }),
      ]);
    // i1: only source. i2: only source. i3: already has both.
    useTermStore.getState().addItemTerm('i1', 'src');
    useTermStore.getState().addItemTerm('i2', 'src');
    useTermStore.getState().addItemTerm('i3', 'src');
    useTermStore.getState().addItemTerm('i3', 'dst');
    const platform = makePlatform();
    const command = createMergeTermsCommand(platform, 'src', 'dst');

    await command.do();
    expect(useTermStore.getState().terms.has('src')).toBe(false);
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['dst']));
    expect(useTermStore.getState().itemTerms.get('i2')).toEqual(new Set(['dst']));
    expect(useTermStore.getState().itemTerms.get('i3')).toEqual(new Set(['dst']));

    await command.undo();
    expect(useTermStore.getState().terms.get('src')).toMatchObject({ name: 'Reveur' });
    expect(useTermStore.getState().itemTerms.get('i1')).toEqual(new Set(['src']));
    expect(useTermStore.getState().itemTerms.get('i2')).toEqual(new Set(['src']));
    // i3 had both before the merge — undo must not strip its pre-existing target link.
    expect(useTermStore.getState().itemTerms.get('i3')).toEqual(new Set(['src', 'dst']));
  });
});

describe('createReorderTermsCommand', () => {
  it('sets sort to index and undo restores the previous order', async () => {
    useTermStore
      .getState()
      .upsertTerms([
        makeTerm({ id: 'a', sort: 0, name: 'A' }),
        makeTerm({ id: 'b', sort: 1, name: 'B' }),
        makeTerm({ id: 'c', sort: 2, name: 'C' }),
      ]);
    const platform = makePlatform();
    const command = createReorderTermsCommand(platform, 'vibe', ['c', 'a', 'b']);

    await command.do();
    expect(useTermStore.getState().terms.get('c')?.sort).toBe(0);
    expect(useTermStore.getState().terms.get('a')?.sort).toBe(1);
    expect(useTermStore.getState().terms.get('b')?.sort).toBe(2);

    await command.undo();
    expect(useTermStore.getState().terms.get('a')?.sort).toBe(0);
    expect(useTermStore.getState().terms.get('b')?.sort).toBe(1);
    expect(useTermStore.getState().terms.get('c')?.sort).toBe(2);
  });
});

describe('createMoveTermCommand', () => {
  it('moves a word to another field with a fresh sort, and undo puts it back', async () => {
    useTermStore.setState({
      terms: new Map([
        [
          'm1',
          makeTerm({ id: 'm1', facet: 'movement', name: 'Grunge', nameNorm: 'grunge', sort: 4 }),
        ],
        ['v1', makeTerm({ id: 'v1', facet: 'vibe', sort: 7 })],
      ]),
      itemTerms: new Map(),
    });
    const platform = makePlatform();
    const command = createMoveTermCommand(platform, 'm1', 'vibe');
    await command.do();
    expect(useTermStore.getState().terms.get('m1')).toMatchObject({ facet: 'vibe', sort: 8 });
    expect(platform.db.execute).toHaveBeenCalledWith(
      'UPDATE terms SET facet = ?, sort = ? WHERE id = ?',
      ['vibe', 8, 'm1'],
    );
    await command.undo();
    expect(useTermStore.getState().terms.get('m1')).toMatchObject({ facet: 'movement', sort: 4 });
  });

  it('merges instead when the target field already has a word of that name', async () => {
    useTermStore.setState({
      terms: new Map([
        ['m1', makeTerm({ id: 'm1', facet: 'movement', name: 'Punk', nameNorm: 'punk' })],
        ['v1', makeTerm({ id: 'v1', facet: 'vibe', name: 'Punk', nameNorm: 'punk' })],
      ]),
      itemTerms: new Map([['i1', new Set(['m1'])]]),
    });
    const command = createMoveTermCommand(makePlatform(), 'm1', 'vibe');
    expect(command.label).toContain('Merge');
    await command.do();
    expect(useTermStore.getState().terms.has('m1')).toBe(false);
    expect(useTermStore.getState().itemTerms.get('i1')?.has('v1')).toBe(true);
  });
});
