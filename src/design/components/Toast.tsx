export interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function Toast({ message, actionLabel, onAction, secondaryLabel, onSecondary }: ToastProps) {
  return (
    <div className="ds-toast" role="status">
      <span>{message}</span>
      {onAction && (
        <button type="button" className="ds-toast__undo" onClick={onAction}>
          {actionLabel ?? 'Undo'}
        </button>
      )}
      {onSecondary && (
        <button type="button" className="ds-toast__undo" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}
