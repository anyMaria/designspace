import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSetLinkCoverCommand } from './linkCoverCommands';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';

const enqueue = vi.fn();
vi.mock('@/workers/ingestQueue', () => ({ getIngestQueue: () => ({ enqueue }) }));

const execute = vi.fn(() => Promise.resolve({ changes: 1 }));
const platform = { db: { execute } } as unknown as Platform;

function link(partial: Partial<Item> = {}): Item {
  return {
    id: 'l1',
    kind: 'link',
    title: 'Example',
    url: 'https://example.com',
    status: 'ok',
    coverPath: null,
    mime: null,
    thumbV: 2,
    linkMeta: {
      finalUrl: 'https://example.com',
      title: null,
      description: null,
      siteName: null,
      imageUrl: null,
      faviconUrl: null,
      noPicture: true,
    },
    ...partial,
  } as Item;
}

describe('createSetLinkCoverCommand', () => {
  beforeEach(() => {
    enqueue.mockClear();
    execute.mockClear();
    useLibraryStore.getState().upsertItem(link());
  });

  it('sets the cover, clears noPicture and makes thumbnails; undo restores the old state', async () => {
    const cmd = createSetLinkCoverCommand(platform, 'l1', {
      relPath: 'a/b.png',
      mime: 'image/png',
    });
    await cmd.do();
    let item = useLibraryStore.getState().items.get('l1');
    expect(item?.coverPath).toBe('a/b.png');
    expect(item?.linkMeta?.noPicture).toBe(false);
    expect(enqueue).toHaveBeenCalledWith([{ itemId: 'l1', relPath: 'a/b.png', mime: 'image/png' }]);

    await cmd.undo();
    item = useLibraryStore.getState().items.get('l1');
    expect(item?.coverPath).toBeNull();
    expect(item?.thumbV).toBe(2);
    expect(item?.linkMeta?.noPicture).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1); // nothing to re-make when there was no cover
  });

  it('re-makes the old thumbnails when undoing back to an earlier cover', async () => {
    useLibraryStore.getState().upsertItem(link({ coverPath: 'old.jpg', mime: 'image/jpeg' }));
    const cmd = createSetLinkCoverCommand(platform, 'l1', {
      relPath: 'new.png',
      mime: 'image/png',
    });
    await cmd.do();
    enqueue.mockClear();
    await cmd.undo();
    expect(useLibraryStore.getState().items.get('l1')?.coverPath).toBe('old.jpg');
    expect(enqueue).toHaveBeenCalledWith([
      { itemId: 'l1', relPath: 'old.jpg', mime: 'image/jpeg' },
    ]);
  });
});
