import { useEffect, useState } from 'react';
import type { Engine } from '@/canvas/Engine';
import { useTermStore } from '@/state/termStore';
import { formatSharedTooltip, type Criterion } from '@/lib/connections';
import { en } from '@/i18n/en';

const CRITERION_LABEL: Record<Criterion, string> = {
  type: en.connections.criterionType,
  vibe: en.connections.criterionVibe,
  movement: en.connections.criterionMovement,
  tag: en.connections.criterionTag,
  color: en.connections.criterionColor,
  manual: en.connections.connectedManually,
  similar: en.connections.criterionSimilar,
};

/** §2.10 "Hovering a line shows what the two items share" — a small label that follows the
 * cursor while a connection line is hovered. Tracks the pointer directly rather than through the
 * engine (which only knows about the line's own hover state, not screen coordinates) since a
 * floating DOM tooltip needs real client coordinates. */
export function ConnectionTooltip({ engine }: { engine: Engine | null }) {
  const terms = useTermStore((s) => s.terms);
  const [text, setText] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!engine) return;
    return engine.on('connectionLineHover', (info) => {
      if (!info) {
        setText(null);
        return;
      }
      const shared = formatSharedTooltip(info.shared, terms, CRITERION_LABEL);
      setText(shared ? `${en.connections.sharedPrefix} · ${shared}` : null);
    });
  }, [engine, terms]);

  useEffect(() => {
    if (!text) return;
    function onMove(e: PointerEvent): void {
      setPos({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [text]);

  if (!text) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x + 14,
        top: pos.y + 14,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-1) var(--space-2)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-1)',
        boxShadow: 'var(--shadow-float)',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}
