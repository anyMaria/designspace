import { en } from '@/i18n/en';

/** The soft "Drop to add" overlay shown while dragging files/images over the canvas (§2.3). */
export function DropOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--canvas) 55%, transparent)',
        border: '2px dashed var(--accent)',
        borderRadius: 'var(--radius-panel)',
        margin: 'var(--space-4)',
        pointerEvents: 'none',
      }}
    >
      <span className="font-display" style={{ fontSize: 'var(--text-xl)' }}>
        {en.dropOverlay.title}
      </span>
    </div>
  );
}
