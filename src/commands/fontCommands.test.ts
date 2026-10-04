import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/platform/types';
import type { FontMeta } from '@/lib/fontRender';
import { useFontFilesStore } from '@/state/fontFilesStore';
import { useLibraryStore } from '@/state/libraryStore';
import type { Item } from '@/state/types';

const enqueue = vi.fn();
vi.mock('@/workers/fontIngestQueue', () => ({ getFontIngestQueue: () => ({ enqueue }) }));
const { createAddFontFilesCommand, createSetFontCardCommand } = await import('./fontCommands');

function makePlatform() {
  const db = {
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ changes: 1 }),
    batch: vi.fn().mockResolvedValue(undefined),
  };
  return { platform: { db } as unknown as Platform, db };
}

const meta = (styleName: string, weight: number, italic = false): FontMeta => ({
  family: 'Urbanist',
  subfamily: styleName,
  fullName: `Urbanist ${styleName}`,
  designer: null,
  manufacturer: null,
  license: null,
  glyphCount: 1,
  variableAxes: [],
  styleName,
  weight,
  italic,
  instances: null,
  vendorId: null,
});
const file = (name: string, m: FontMeta) => ({
  filePath: `media/${name}`,
  fileName: name,
  fileHash: `h-${name}`,
  fileSize: 10,
  mime: 'font/ttf',
  meta: m,
});

beforeEach(() => {
  enqueue.mockClear();
  useFontFilesStore.setState({ files: new Map() });
  useLibraryStore.setState({ items: new Map(), placements: new Map() });
});

describe('createAddFontFilesCommand', () => {
  it('adds the files (upright first, lighter first), re-queues the card, and undo hides them', async () => {
    const { platform, db } = makePlatform();
    const cmd = createAddFontFilesCommand(platform, 'fam', [
      file('bold.ttf', meta('Bold', 700)),
      file('italic.ttf', meta('Italic', 400, true)),
      file('light.ttf', meta('Light', 300)),
    ]);
    await cmd.do();
    const files = useFontFilesStore.getState().files.get('fam') ?? [];
    expect(files.map((f) => f.fileName)).toEqual(['light.ttf', 'bold.ttf', 'italic.ttf']);
    expect(db.batch.mock.calls[0][0]).toHaveLength(3);
    expect(enqueue).toHaveBeenCalledWith([{ itemId: 'fam' }]);

    await cmd.undo();
    expect(useFontFilesStore.getState().files.get('fam')).toBeUndefined();
    expect(db.batch.mock.calls[1][0][0].sql).toContain('deleted_at');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});

describe('createSetFontCardCommand', () => {
  it('writes the options, re-queues, and undo restores the old ones', async () => {
    const { platform, db } = makePlatform();
    const item = { id: 'fam', kind: 'font', title: 'U', fontCard: null } as unknown as Item;
    useLibraryStore.setState({ items: new Map([['fam', item]]) });
    const next = { fileId: 'a', wght: 600, size: 'l' as const, text: 'Hello' };
    const cmd = createSetFontCardCommand(platform, 'fam', next);
    await cmd.do();
    expect(useLibraryStore.getState().items.get('fam')?.fontCard).toEqual(next);
    expect(db.execute.mock.calls[0][1][0]).toBe(JSON.stringify(next));
    expect(enqueue).toHaveBeenCalledWith([{ itemId: 'fam' }]);
    await cmd.undo();
    expect(useLibraryStore.getState().items.get('fam')?.fontCard).toBeNull();
    expect(db.execute.mock.calls[1][1][0]).toBeNull();
  });
});
