import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ds-empty-state">
      <div className="ds-empty-state__title">{title}</div>
      {description && <div>{description}</div>}
      {action}
    </div>
  );
}
