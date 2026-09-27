import type { HTMLAttributes } from 'react';

export function Dock({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['ds-dock', className].filter(Boolean).join(' ')} {...rest} />;
}

export function DockDivider() {
  return <div className="ds-dock__divider" role="separator" />;
}
