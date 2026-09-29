import { describe, expect, it, vi } from 'vitest';
import { loadLibraryStats } from './libraryStats';
import type { Platform } from '@/platform/types';

function makePlatform(rows: unknown[]): Platform {
  return {
    db: {
      select: vi.fn().mockResolvedValue(rows),
      execute: vi.fn(),
      batch: vi.fn(),
    },
  } as unknown as Platform;
}

describe('loadLibraryStats', () => {
  it('sums counts and bytes per kind, and overall', async () => {
    const platform = makePlatform([
      { kind: 'image', count: 3, bytes: 3000 },
      { kind: 'video', count: 1, bytes: 500000 },
    ]);

    const stats = await loadLibraryStats(platform);

    expect(stats.itemCounts).toEqual({ image: 3, video: 1 });
    expect(stats.totalItems).toBe(4);
    expect(stats.totalBytes).toBe(503000);
  });

  it('returns zeros for an empty library', async () => {
    const stats = await loadLibraryStats(makePlatform([]));
    expect(stats.itemCounts).toEqual({});
    expect(stats.totalItems).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });

  it('treats a null byte sum as 0', async () => {
    const stats = await loadLibraryStats(makePlatform([{ kind: 'note', count: 2, bytes: null }]));
    expect(stats.totalBytes).toBe(0);
    expect(stats.itemCounts.note).toBe(2);
  });
});
