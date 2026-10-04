import { useToastStore } from '@/state/toastStore';
import { useTrashUiStore } from '@/state/trashUiStore';
import { en } from '@/i18n/en';

/** "Moved <n> items to Trash · Undo · Open Trash" (Patch 2 · C5) — one message for the three places
 * that move items to the Trash (shortcut, right-click menu, bulk Details). */
export function showTrashToast(count: number, undo: () => void): void {
  useToastStore.getState().show(en.toasts.movedToTrash(count), {
    actionLabel: en.toasts.undo,
    onAction: undo,
    secondaryLabel: en.toasts.openTrash,
    onSecondary: () => useTrashUiStore.getState().show(),
  });
}
