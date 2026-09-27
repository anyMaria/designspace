export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ds-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="ds-toggle__thumb" />
    </button>
  );
}
