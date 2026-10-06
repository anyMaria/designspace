import { useEffect, useState } from 'react';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { hoverNameFor } from './hoverName';
import { motion } from '@/design/tokens';
import { useLibraryStore } from '@/state/libraryStore';
import { useUiStore } from '@/state/uiStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { useConnectionIndex } from '@/features/connections/useConnectionIndex';
import { scoreCandidates } from '@/lib/connections';
import { en } from '@/i18n/en';
import { KindIcon } from '@/lib/kindIcon';

const CRITERION_KEY = {
  type: 'criterionType',
  vibe: 'criterionVibe',
  movement: 'criterionMovement',
  tag: 'criterionTag',
  color: 'criterionColor',
  manual: 'criterionManual',
} as const;

const GAP_PX = 8;
const PILL_HEIGHT_PX = 32;

/** The name pill under a hovered card (Patch 1 · B3). Appears after the pointer rests on the same
 * card for a moment, hides at once when the hover ends, on any press on the canvas, and while the
 * camera moves (it comes back a moment after the camera stops, if still hovering). */
export function CanvasHoverOverlay({ engine }: { engine: Engine | null }) {
  const enabled = useUiStore((s) => s.showNamesOnHover);
  const items = useLibraryStore((s) => s.items);
  const camera = useCameraState(engine);
  const mode = useConnectionsUiStore((s) => s.mode);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const minStrength = useConnectionsUiStore((s) => s.minStrength);
  const index = useConnectionIndex(enabled && mode === 'hover');
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

  // Patch 2 · A1: say so when the hovered card connects to nothing under the active criteria.
  const none =
    shownId && index && mode === 'hover'
      ? scoreCandidates(shownId, activeCriteria, index, minStrength).length === 0
      : false;
  const noneText = none
    ? en.connections.noneForItem(
        activeCriteria
          .filter((c) => c !== 'manual')
          .map((c) => (c === 'tag' ? 'Tag' : en.connections[CRITERION_KEY[c]]))
          .join(' or ') || en.connections.criterionManual,
      )
    : null;

  const below = rect.y + rect.h + GAP_PX + PILL_HEIGHT_PX <= window.innerHeight;
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x + rect.w / 2,
        top: below ? rect.y + rect.h + GAP_PX : rect.y - GAP_PX,
        transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
        zIndex: 1,
        maxWidth: 'var(--hover-name-max-width)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'none',
      }}
    >
      <div
        data-testid="hover-name"
        style={{
          maxWidth: '100%',
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
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {item && (
            <span style={{ display: 'inline-flex', color: 'var(--text-2)', flex: 'none' }}>
              <KindIcon item={item} size={14} />
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </span>
      </div>
      {noneText && (
        <div
          data-testid="hover-name-none"
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-1-92)',
            color: 'var(--text-2)',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'nowrap',
          }}
        >
          {noneText}
        </div>
      )}
    </div>
  );
}
