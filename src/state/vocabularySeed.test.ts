import { describe, expect, it, vi } from 'vitest';
import { seedVocabulary } from './vocabularySeed';
import type { DbStatement, Platform } from '@/platform/types';

function makePlatform(existingCount: number): {
  platform: Platform;
  batch: ReturnType<typeof vi.fn>;
} {
  const batch = vi.fn().mockResolvedValue(undefined);
  const platform = {
    db: {
      select: vi.fn().mockResolvedValue([{ count: existingCount }]),
      execute: vi.fn(),
      batch,
    },
  } as unknown as Platform;
  return { platform, batch };
}

describe('seedVocabulary', () => {
  it('does nothing if terms already exist', async () => {
    const { platform, batch } = makePlatform(5);
    await seedVocabulary(platform);
    expect(batch).not.toHaveBeenCalled();
  });

  it('inserts Type, Vibe and Movement starter terms with per-facet sort indices', async () => {
    const { platform, batch } = makePlatform(0);
    await seedVocabulary(platform);
    expect(batch).toHaveBeenCalledTimes(1);
    const statements = batch.mock.calls[0][0] as DbStatement[];

    const byFacet = (facet: string) => statements.filter((s) => s.params?.[1] === facet);
    expect(byFacet('type').length).toBe(21);
    expect(byFacet('vibe').length).toBe(24);
    expect(byFacet('movement').length).toBe(31);

    // Each facet's sort starts back at 0.
    expect(byFacet('type')[0].params?.[5]).toBe(0);
    expect(byFacet('vibe')[0].params?.[5]).toBe(0);
    expect(byFacet('movement')[0].params?.[5]).toBe(0);

    // A hinted movement carries its hint; most entries fall back to null.
    const memphis = byFacet('movement').find((s) => s.params?.[2] === 'Memphis');
    expect(memphis?.params?.[4]).toContain('Memphis Group');
    const bauhaus = byFacet('movement').find((s) => s.params?.[2] === 'Bauhaus');
    expect(bauhaus?.params?.[4]).toBeNull();
  });
});
