import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeleteTermCommand,
  createMergeTermsCommand,
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
