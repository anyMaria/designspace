import type { ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

export function Menu({
  items,
  'aria-label': ariaLabel,
}: {
  items: MenuItem[];
  'aria-label': string;
}) {
  return (
    <div className="ds-menu" role="menu" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="ds-menu__item"
          disabled={item.disabled}
          onClick={item.onSelect}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
