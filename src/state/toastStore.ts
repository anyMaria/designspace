import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  /** Defaults to "Undo" (§2.16) when `onAction` is set without a label — duplicate-detection
   * toasts (§2.3) use "Show"/"Restore" instead. */
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss; 0 disables it. */
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (
    message: string,
    opts?: { actionLabel?: string; onAction?: () => void; duration?: number },
  ) => string;
  dismiss: (id: string) => void;
}

let nextId = 0;

/** Toasts with Undo — §2.16 "Every destructive action shows a toast with Undo." Rendered by
 * `<ToastHost>` in the app shell. */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, opts) => {
    const id = `toast-${++nextId}`;
    set((s) => ({
      toasts: [
        ...s.toasts,
        {
          id,
          message,
          actionLabel: opts?.actionLabel,
          onAction: opts?.onAction,
          duration: opts?.duration ?? 5000,
        },
      ],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
