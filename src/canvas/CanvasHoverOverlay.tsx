import { useEffect, useState } from 'react';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { hoverNameFor } from './hoverName';
import { motion } from '@/design/tokens';
import { useLibraryStore } from '@/state/libraryStore';
import { useUiStore } from '@/state/uiStore';

const GAP_PX = 8;
const PILL_HEIGHT_PX = 32;

/** The name pill under a hovered card (Patch 1 · B3). Appears after the pointer rests on the same
 * card for a moment, hides at once when the hover ends, on any press on the canvas, and while the
 * camera moves (it comes back a moment after the camera stops, if still hovering). */
export function CanvasHoverOverlay({ engine }: { engine: Engine | null }) {
  const enabled = useUiStore((s) => s.showNamesOnHover);
  const items = useLibraryStore((s) => s.items);
  const camera = useCameraState(engine);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The pill is visible only for the card and camera it was timed for: any change of either hides
  // it at once, and the timer below shows it again if the pointer is still resting there.
  const [shown, setShown] = useState<{ id: string; camera: unknown } | null>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.on('hover', setHoverId);
  }, [engine]);

  // Restarts on every camera change, so the pill hides while the camera moves.
  useEffect(() => {
    if (!enabled || !hoverId) return;
    const timer = window.setTimeout(() => setShown({ id: hoverId, camera }), motion.hoverName);
    return () => window.clearTimeout(timer);
  }, [hoverId, camera, enabled]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement) setShown(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  const shownId =
    enabled && shown && shown.id === hoverId && shown.camera === camera ? shown.id : null;
  const item = shownId ? items.get(shownId) : undefined;
  const rect = shownId && engine ? engine.getScreenRect(shownId) : null;
  const name = item ? hoverNameFor(item) : null;
  if (!rect || !name) return null;

  const below = rect.y + rect.h + GAP_PX + PILL_HEIGHT_PX <= window.innerHeight;
  return (
    <div
      data-testid="hover-name"
      style={{
        position: 'absolute',
        left: rect.x + rect.w / 2,
        top: below ? rect.y + rect.h + GAP_PX : rect.y - GAP_PX,
        transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
        zIndex: 1,
        maxWidth: 'var(--hover-name-max-width)',
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-1-92)',
        border: '1px solid var(--hairline)',
        color: 'var(--text-1)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}
    >
      {name}
    </div>
  );
}
