import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  onUndo?: () => void;
  /** ms before auto-dismiss; 0 disables it. */
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, opts?: { onUndo?: () => void; duration?: number }) => string;
  dismiss: (id: string) => void;
}

let nextId = 0;

/** Toasts with Undo — §2.16 "Every destructive action shows a toast with Undo." Rendered by
 * `<ToastHost>` in the app shell. */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, opts) => {
    const id = `toast-${++nextId}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, onUndo: opts?.onUndo, duration: opts?.duration ?? 5000 }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
