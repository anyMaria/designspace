import { useEffect, type ReactNode } from 'react';

export interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Dialog({ title, children, onClose }: DialogProps) {
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Capture phase, not bubble: some element between the real keypress and `window` calls
    // `stopPropagation` on Escape's bubble phase (only visible with a real keystroke, not a
    // synthetic `dispatchEvent` — a `page.keyboard.press('Escape')` E2E check caught it), which
    // silently ate every Dialog's Escape-to-close before this fix, for every Dialog in the app
    // (Settings included) since it shipped in M1 — nothing had tested it until now.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="ds-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-dialog" role="dialog" aria-modal="true" aria-label={title}>
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
