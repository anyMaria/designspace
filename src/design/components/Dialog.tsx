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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
