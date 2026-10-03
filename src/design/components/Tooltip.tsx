import { useRef, useState, type ReactNode } from 'react';
import { Kbd } from './Kbd';

export interface TooltipProps {
  label: string;
  children: ReactNode;
  delayMs?: number;
  /** Above (default) or below the child; use `bottom` for controls at the top of the window. */
  placement?: 'top' | 'bottom';
  /** Shown as a key cap after the label, e.g. `Ctrl+K`. */
  shortcut?: string;
}

/** Wraps a single focusable child and shows a small label after a hover/focus delay (500ms). */
export function Tooltip({
  label,
  children,
  delayMs = 500,
  placement = 'top',
  shortcut,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function show() {
    timer.current = setTimeout(() => setVisible(true), delayMs);
  }
  function hide() {
    clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className="ds-tooltip"
          style={{
            position: 'absolute',
            ...(placement === 'top' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      )}
    </span>
  );
}
