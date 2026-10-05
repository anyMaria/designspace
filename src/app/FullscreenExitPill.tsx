import { useEffect, useState } from 'react';
import type { Platform } from '@/platform';
import { useUiStore } from '@/state/uiStore';
import { en } from '@/i18n/en';
import { setFullscreen } from './fullscreen';

const SHOW_ON_ENTER_MS = 3000;
const EDGE_PX = 6;

/** "Exit full screen · Esc" (Patch 3 · A2): a small pill at the top centre, shown for 3 s when
 * full screen starts and whenever the pointer touches the top edge. Clicking it leaves full
 * screen. Fades with the overlay duration token (which is 0 under Reduce motion). */
export function FullscreenExitPill({ platform }: { platform: Platform }) {
  const fullscreen = useUiStore((s) => s.fullscreen);
  const [onEntry, setOnEntry] = useState(false);
  const [atEdge, setAtEdge] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const show = setTimeout(() => setOnEntry(true), 0);
    const hide = setTimeout(() => setOnEntry(false), SHOW_ON_ENTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      setOnEntry(false);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onMove = (e: PointerEvent) => setAtEdge(e.clientY <= EDGE_PX);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      setAtEdge(false);
    };
  }, [fullscreen]);

  if (!fullscreen) return null;
  const visible = onEntry || atEdge;
  return (
    <button
      type="button"
      data-testid="fullscreen-exit-pill"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => void setFullscreen(platform, false)}
      style={{
        position: 'absolute',
        top: 'var(--space-3)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4,
        padding: 'var(--space-2) var(--space-4)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-1-92)',
        color: 'var(--text-1)',
        font: 'inherit',
        fontSize: 'var(--text-sm)',
        whiteSpace: 'nowrap',
        boxShadow: 'var(--shadow-float)',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity var(--duration-overlay) ease',
      }}
    >
      {en.fullscreen.exitPill}
    </button>
  );
}
