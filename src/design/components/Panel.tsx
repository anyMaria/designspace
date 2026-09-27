import type { HTMLAttributes } from 'react';

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['ds-panel', className].filter(Boolean).join(' ')} {...rest} />;
}
