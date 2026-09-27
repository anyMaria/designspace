import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine } from './Engine';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { buildConnectionIndex, restrictToSelection, scoreCandidates } from '@/lib/connections';

const HOVER_DELAY_MS = 300;

/** Wires §2.10's "On hover (and on selection)" into the canvas: 300ms after hovering an item (or
 * immediately on selection — selection takes priority, since it's a deliberate action), scores
 * candidates via `lib/connections.ts` and hands them to `Engine.setConnections`. With several
 * items selected, each one's candidates are restricted to the rest of the selection ("only the
 * connections among them show"); with exactly one selected (or just hovered), the full ranked
 * list shows. "Show all" mode is handled separately (M3-4) — this only drives Hover mode. */
export function useConnectionsBinding(engine: Engine | null): void {
  const items = useLibraryStore((s) => s.items);
  const selection = useLibraryStore((s) => s.selection);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const minStrength = useConnectionsUiStore((s) => s.minStrength);
  const mode = useConnectionsUiStore((s) => s.mode);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.on('hover', (id) => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
      if (!id) {
        setHoveredId(null);
        return;
      }
      hoverTimer.current = window.setTimeout(() => setHoveredId(id), HOVER_DELAY_MS);
    });
  }, [engine]);

  const index = useMemo(
    () => buildConnectionIndex(items.values(), itemTerms, terms, connections.values()),
    [items, itemTerms, terms, connections],
  );

  useEffect(() => {
    if (!engine) return;
    if (mode !== 'hover') return; // Show all (M3-4) owns the lines/dim itself while active

    if (selection.size === 1) {
      const fromId = [...selection][0];
      engine.setConnections([
        { fromId, candidates: scoreCandidates(fromId, activeCriteria, index, minStrength) },
      ]);
      return;
    }
    if (selection.size > 1) {
      const ids = [...selection];
      const idSet = new Set(ids);
      const sources = ids.map((fromId) => {
        const others = new Set(idSet);
        others.delete(fromId);
        const candidates = scoreCandidates(fromId, activeCriteria, index, minStrength);
        return { fromId, candidates: restrictToSelection(candidates, others) };
      });
      engine.setConnections(sources);
      return;
    }
    if (hoveredId) {
      engine.setConnections([
        {
          fromId: hoveredId,
          candidates: scoreCandidates(hoveredId, activeCriteria, index, minStrength),
        },
      ]);
      return;
    }
    engine.setConnections([]);
  }, [engine, mode, selection, hoveredId, index, activeCriteria, minStrength]);
}
