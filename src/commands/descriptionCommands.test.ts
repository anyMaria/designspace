import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSetDescriptionCommand } from './descriptionCommands';
import { useLibraryStore } from '@/state/libraryStore';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';

const doc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'warm' }] }],
};

function setup(item: Partial<Item> = {}) {
  const execute = vi.fn().mockResolvedValue({ changes: 1 });
  const platform = { db: { execute } } as unknown as Platform;
  useLibraryStore.setState({
    items: new Map([['i', { id: 'i', kind: 'image', updatedAt: 'x', ...item } as Item]]),
  });
  return { platform, execute };
}

beforeEach(() => useLibraryStore.setState({ items: new Map() }));

describe('createSetDescriptionCommand', () => {
  it('writes JSON and plain text in one statement, and undo restores the old values', async () => {
    const { platform, execute } = setup({ description: null, descriptionText: null });
    const cmd = createSetDescriptionCommand(platform, 'i', doc, 'warm');

    await cmd.do();
    expect(useLibraryStore.getState().items.get('i')?.descriptionText).toBe('warm');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[1]).toEqual([
      JSON.stringify(doc),
      'warm',
      expect.any(String),
      'i',
    ]);

    await cmd.undo();
    const item = useLibraryStore.getState().items.get('i');
    expect(item?.description).toBeNull();
    expect(item?.descriptionText).toBeNull();
  });

  it('an empty text clears the description, and undo brings the old one back', async () => {
    const { platform } = setup({ description: doc, descriptionText: 'warm' });
    const cmd = createSetDescriptionCommand(platform, 'i', { type: 'doc', content: [] }, '   ');
    await cmd.do();
    expect(useLibraryStore.getState().items.get('i')?.descriptionText).toBeNull();
    await cmd.undo();
    expect(useLibraryStore.getState().items.get('i')?.descriptionText).toBe('warm');
  });
});
