import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

export const SearchField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchField({ className, ...rest }, ref) {
    return (
      <label className={['ds-search-field', className].filter(Boolean).join(' ')}>
        <Search size={18} strokeWidth={1.75} aria-hidden />
        <input ref={ref} type="text" {...rest} />
      </label>
    );
  },
);
