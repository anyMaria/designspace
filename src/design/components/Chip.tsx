import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ChipProps {
  children: ReactNode;
  /** A criterion color token (e.g. 'var(--criterion-vibe)') shown as a leading dot. */
  dotColor?: string;
  variant?: 'default' | 'suggestion' | 'excluded';
  onRemove?: () => void;
  onClick?: () => void;
}

export function Chip({ children, dotColor, variant = 'default', onRemove, onClick }: ChipProps) {
  const classes = [
    'ds-chip',
    variant === 'suggestion' ? 'ds-chip--suggestion' : '',
    variant === 'excluded' ? 'ds-chip--excluded' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {dotColor && <span className="ds-chip__dot" style={{ background: dotColor }} />}
      {variant === 'suggestion' && <span aria-hidden>✦</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          className="ds-chip__remove"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}
