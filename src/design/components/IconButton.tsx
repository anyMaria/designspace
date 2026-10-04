import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  active?: boolean;
  /** Shown next to the label in the tooltip, e.g. `Ctrl+K`. */
  shortcut?: string;
  /** Buttons at the top of the window use `bottom`: a tooltip above them would leave the screen. */
  tooltipPlacement?: 'top' | 'bottom';
}

/** A round, raised icon-only button. `label` is the accessible name and the styled tooltip
 * (with its shortcut); there is no native `title`, which is slow and can't show a shortcut. */
export function IconButton({
  icon,
  label,
  active,
  className,
  shortcut,
  tooltipPlacement,
  ...rest
}: IconButtonProps) {
  const classes = ['ds-icon-button', active ? 'ds-icon-button--active' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Tooltip label={label} shortcut={shortcut} placement={tooltipPlacement}>
      <button className={classes} aria-label={label} aria-pressed={active} {...rest}>
        {icon}
      </button>
    </Tooltip>
  );
}
