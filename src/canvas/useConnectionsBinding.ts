import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine, ShowAllHub } from './Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import { useSearchResults } from '@/features/search/useSearchResults';
import {
  buildConnectionIndex,
  computeHubs,
  formatHubLabel,
  restrictToSelection,
  scoreCandidates,
} from '@/lib/connections';

const HOVER_DELAY_MS = 300;

/** Wires §2.10's Connections modes into the canvas. **Hover** (and on selection): 300ms after
 * hovering an item (or immediately on selection — a deliberate action doesn't need the delay),
 * scores candidates via `lib/connections.ts` and hands them to `Engine.setConnections`. With
 * several items selected, each one's candidates are restricted to the rest of the selection
 * ("only the connections among them show"); with exactly one selected (or just hovered), the
 * full ranked list shows. **Show all**: every value shared by 2+ *visible* items (soft-deleted
 * items excluded, and restricted to the active search filter's matches, same as Constellations
 * "respects the active filter") becomes a hub via `computeHubs`, handed to
 * `Engine.setShowAllHubs`; past the 5,000-line cap, no hubs are drawn and
 * `connectionsUiStore.showAllOverLimit` is set instead, for the popover's "Too many links" message. */
export function useConnectionsBinding(engine: Engine | null, platform: Platform): void {
  const items = useLibraryStore((s) => s.items);
  const selection = useLibraryStore((s) => s.selection);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const embeddings = useEmbeddingsStore((s) => s.vectors);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const minStrength = useConnectionsUiStore((s) => s.minStrength);
  const mode = useConnectionsUiStore((s) => s.mode);
  const { matches } = useSearchResults(platform);

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
    () => buildConnectionIndex(items.values(), itemTerms, terms, connections.values(), embeddings),
    [items, itemTerms, terms, connections, embeddings],
  );

  useEffect(() => {
    if (!engine) return;

    if (mode === 'showAll') {
      engine.setConnections([]); // Hover's lines/dim don't apply while Show all owns the canvas

      const visible: string[] = [];
      for (const item of items.values()) {
        if (item.deletedAt) continue;
        if (matches && !matches.has(item.id)) continue;
        visible.push(item.id);
      }
      const { hubs, overLimit } = computeHubs(visible, activeCriteria, index);
      useConnectionsUiStore.getState().setShowAllOverLimit(overLimit);

      if (overLimit) {
        engine.setShowAllHubs([]);
        return;
      }
      const itemTitles = new Map<string, string>();
      for (const id of visible) {
        const title = items.get(id)?.title;
        if (title) itemTitles.set(id, title);
      }
      const labeled: ShowAllHub[] = hubs.map((h) => ({
        ...h,
        label: formatHubLabel(h, terms, itemTitles),
      }));
      engine.setShowAllHubs(labeled);
      return;
    }

    engine.setShowAllHubs([]);
    useConnectionsUiStore.getState().setShowAllOverLimit(false);

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
  }, [
    engine,
    mode,
    selection,
    hoveredId,
    index,
    activeCriteria,
    minStrength,
    items,
    matches,
    terms,
  ]);
}
