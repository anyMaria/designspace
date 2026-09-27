import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

export function SearchField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={['ds-search-field', className].filter(Boolean).join(' ')}>
      <Search size={18} strokeWidth={1.75} aria-hidden />
      <input type="text" {...rest} />
    </label>
  );
}
