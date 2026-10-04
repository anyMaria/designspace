import { useEffect } from 'react';
import { useToastStore } from '@/state/toastStore';
import { Toast } from '@/design/components';

/** Renders the toast stack (§2.16 "every destructive action shows a toast with Undo") —
 * bottom-center, above the dock. Each toast auto-dismisses after its `duration`. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timers = toasts
      .filter((t) => (t.duration ?? 5000) > 0)
      .map((t) => setTimeout(() => dismiss(t.id), t.duration ?? 5000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(var(--space-4) + var(--hit-target-min) + var(--space-4))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        alignItems: 'center',
      }}
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          actionLabel={t.actionLabel}
          onAction={
            t.onAction
              ? () => {
                  t.onAction?.();
                  dismiss(t.id);
                }
              : undefined
          }
          secondaryLabel={t.secondaryLabel}
          onSecondary={
            t.onSecondary
              ? () => {
                  t.onSecondary?.();
                  dismiss(t.id);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
