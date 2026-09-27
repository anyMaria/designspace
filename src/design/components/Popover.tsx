import type { HTMLAttributes } from 'react';

export function Popover({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['ds-popover', className].filter(Boolean).join(' ')} role="dialog" {...rest} />
  );
}
