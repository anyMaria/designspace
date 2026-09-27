export interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <div className="ds-toast" role="status">
      <span>{message}</span>
      {onAction && (
        <button type="button" className="ds-toast__undo" onClick={onAction}>
          {actionLabel ?? 'Undo'}
        </button>
      )}
    </div>
  );
}
