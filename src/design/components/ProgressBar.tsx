export interface ProgressBarProps {
  /** 0–1, or undefined for an indeterminate bar. */
  value?: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = value === undefined ? 100 : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="ds-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value === undefined ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="ds-progress__fill"
        style={{ width: `${pct}%`, opacity: value === undefined ? 0.5 : 1 }}
      />
    </div>
  );
}
