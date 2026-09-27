import { useLibraryStore } from '@/state/libraryStore';
import { useTriageStore } from '@/state/triageStore';

/** Opens Triage over the current Inbox, oldest first — shared by the Inbox chip's click and the
 * "I" keyboard shortcut (§2.15) so both build the same snapshot the same way. */
export function openInboxTriage(): void {
  const items = [...useLibraryStore.getState().items.values()]
    .filter((i) => !i.deletedAt && !i.sortedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  useTriageStore.getState().open(items.map((i) => i.id));
}
