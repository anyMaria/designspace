import type { InputHTMLAttributes } from 'react';

export function Slider({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input type="range" className={['ds-slider', className].filter(Boolean).join(' ')} {...rest} />
  );
}
