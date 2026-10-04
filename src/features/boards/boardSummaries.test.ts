import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/platform/types';
import { loadBoardSummaries } from './boardSummaries';

function platformWith(rows: Record<string, unknown>[]): Platform {
  return { db: { select: vi.fn().mockResolvedValue(rows) } } as unknown as Platform;
}

const row = (board: string, id: string, kind = 'image', status = 'ok') => ({
  board_id: board,
  item_id: id,
  kind,
  status,
});

describe('loadBoardSummaries', () => {
  it('counts items per board and keeps at most four picture covers', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => row('b1', id));
    const summaries = await loadBoardSummaries(platformWith([...rows, row('b2', 'z')]));
    expect(summaries.get('b1')?.count).toBe(6);
    expect(summaries.get('b1')?.coverIds).toEqual(['a', 'b', 'c', 'd']);
    expect(summaries.get('b2')).toEqual({ count: 1, coverIds: ['z'] });
  });

  it('only pictures that are ready make covers', async () => {
    const summaries = await loadBoardSummaries(
      platformWith([
        row('b', 'note', 'note'),
        row('b', 'font', 'font'),
        row('b', 'pending', 'image', 'pending'),
        row('b', 'ok', 'image'),
      ]),
    );
    expect(summaries.get('b')).toEqual({ count: 4, coverIds: ['ok'] });
  });
});
