import type { ReactNode } from 'react';

export interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  'aria-label': string;
}

/** A segmented control (used for List/Details, tool toggles, etc). */
export function Tabs<T extends string>({ tabs, value, onChange, ...rest }: TabsProps<T>) {
  return (
    <div className="ds-tabs" role="tablist" aria-label={rest['aria-label']}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="ds-tabs__tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
