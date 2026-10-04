import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface MenuItem {
  id: string;
  kind?: 'item';
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** A tick on the right: this is where you are now. */
  checked?: boolean;
  /** A dimmer second line under the label. */
  secondary?: string;
  /** Right-aligned text, e.g. a count. */
  trailing?: string;
}

export interface MenuSeparator {
  kind: 'separator';
  id: string;
}

export interface MenuHeader {
  kind: 'header';
  id: string;
  label: string;
}

/** A row the menu doesn't draw itself (a text field, a full-width button…). */
export interface MenuCustom {
  kind: 'custom';
  id: string;
  node: ReactNode;
}

export type MenuEntry = MenuItem | MenuSeparator | MenuHeader | MenuCustom;

export function Menu({
  items,
  'aria-label': ariaLabel,
}: {
  items: MenuEntry[];
  'aria-label': string;
}) {
  return (
    <div className="ds-menu" role="menu" aria-label={ariaLabel}>
      {items.map((item) => {
        if (item.kind === 'separator')
          return <div key={item.id} className="ds-menu__separator" role="separator" />;
        if (item.kind === 'header')
          return (
            <div key={item.id} className="ds-menu__header">
              {item.label}
            </div>
          );
        if (item.kind === 'custom') return <div key={item.id}>{item.node}</div>;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="ds-menu__item"
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.icon}
            <span className="ds-menu__main">
              <span className="ds-menu__label">{item.label}</span>
              {item.secondary && <span className="ds-menu__secondary">{item.secondary}</span>}
            </span>
            {item.trailing && <span className="ds-menu__trailing">{item.trailing}</span>}
            {item.checked && <Check size={16} strokeWidth={2} aria-label="current" />}
          </button>
        );
      })}
    </div>
  );
}
