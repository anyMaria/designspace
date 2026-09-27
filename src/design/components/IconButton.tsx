import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  active?: boolean;
}

/** A round, raised icon-only button. `label` becomes the accessible name and the tooltip. */
export function IconButton({ icon, label, active, className, ...rest }: IconButtonProps) {
  const classes = ['ds-icon-button', active ? 'ds-icon-button--active' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} aria-label={label} title={label} aria-pressed={active} {...rest}>
      {icon}
    </button>
  );
}
