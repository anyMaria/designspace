import { useEffect, useRef, type ReactNode } from 'react';
import { useEscape } from '@/app/useEscape';

export interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, children, onClose, className }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscape(true, onClose, { allowWhileTyping: true });

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      // Focus trap (WAI-ARIA modal dialog pattern): Tab/Shift+Tab cycle only through the
      // dialog's own focusable elements, so keyboard focus never lands on the dimmed content
      // behind the overlay.
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    // Moves focus into the dialog on open (so screen readers announce it and Tab starts there
    // rather than on whatever was focused behind the overlay) and restores it to the trigger
    // element on close — the other half of the WAI-ARIA modal dialog pattern above.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  return (
    <div
      className="ds-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={className ? `ds-dialog ${className}` : 'ds-dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2
          className="font-display"
          style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--text-xl)' }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
