import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import type { Command } from './types';

/** Sets (or clears, with `json = null`) an item's long description: the TipTap document and its
 * plain text for search, in one write (Patch 1 · E1). */
export function createSetDescriptionCommand(
  platform: Platform,
  itemId: string,
  json: unknown,
  text: string,
): Command {
  const previous = useLibraryStore.getState().items.get(itemId);
  const previousJson = previous?.description ?? null;
  const previousText = previous?.descriptionText ?? null;

  async function apply(nextJson: unknown, nextText: string | null): Promise<void> {
    const current = useLibraryStore.getState().items.get(itemId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    useLibraryStore.getState().upsertItem({
      ...current,
      description: nextJson,
      descriptionText: nextText,
      updatedAt,
    });
    await platform.db.execute(
      'UPDATE items SET description = ?, description_text = ?, updated_at = ? WHERE id = ?',
      [
        nextJson !== null && nextJson !== undefined ? JSON.stringify(nextJson) : null,
        nextText,
        updatedAt,
        itemId,
      ],
    );
  }

  const cleared = json === null || text.trim() === '';
  return {
    label: 'Edit description',
    do: () => (cleared ? apply(null, null) : apply(json, text)),
    undo: () => apply(previousJson, previousText),
  };
}
