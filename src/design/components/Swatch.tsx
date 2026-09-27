export interface SwatchProps {
  hex: string;
  name?: string;
  onClick?: () => void;
}

/** Clicking copies the HEX value, per §2.4. */
export function Swatch({ hex, name, onClick }: SwatchProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      // Clipboard access can be denied (permissions, non-secure context); the swatch still shows the value.
    }
    onClick?.();
  }
  return (
    <button
      type="button"
      className="ds-swatch"
      onClick={() => void copy()}
      aria-label={`Copy ${hex}`}
    >
      <span className="ds-swatch__block" style={{ background: hex }} />
      <span className="ds-swatch__label">{name ?? hex}</span>
    </button>
  );
}
