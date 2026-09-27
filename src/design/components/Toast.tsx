export interface ToastProps {
  message: string;
  onUndo?: () => void;
}

export function Toast({ message, onUndo }: ToastProps) {
  return (
    <div className="ds-toast" role="status">
      <span>{message}</span>
      {onUndo && (
        <button type="button" className="ds-toast__undo" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  );
}
