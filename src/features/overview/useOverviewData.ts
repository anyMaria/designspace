import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import {
  buildConnectionIndex,
  computeHubs,
  formatHubLabel,
  type Criterion,
} from '@/lib/connections';
import { itemColorOf } from '@/lib/itemColor';
import { thumbUrl } from '@/lib/thumbs';
import { isMediaItem } from '@/lib/itemKinds';
import { prefersReducedMotion } from '@/lib/motion';
import { useOverviewStore } from './overviewStore';
import {
  buildOverviewModel,
  type OverviewHubInput,
  type OverviewModel,
  type OverviewNode,
} from './overviewModel';
import { GraphController, type LivePositions } from './graphSim';

// Criteria drawn as hubs: "similar" has no discrete value and "manual" is drawn as direct lines.
const HUB_CRITERIA: Criterion[] = ['type', 'vibe', 'movement', 'tag', 'color'];

export interface OverviewData {
  model: OverviewModel;
  /** Clusters: the live positions, moved by the simulation. Null in My layout (real positions). */
  live: LivePositions | null;
  /** Changes when the camera should fit again (opening, switching layout, a new simulation). */
  fitKey: string;
  /** 'failed': the layout worker failed or was too slow; show `retry`. */
  status: 'ready' | 'arranging' | 'failed';
  retry: () => void;
  dragNode: (id: string, x: number, y: number) => void;
  releaseNode: (id: string) => void;
}

/** The Overview's model for the current space. "My layout" uses real positions. "Clusters" runs the
 * live graph (Patch 3 · D1): a worker keeps simulating items and stars, and the canvas reads their
 * positions every frame. The simulation restarts only when the items, the criteria or the number
 * of connections change; Spacing and dragging are messages to it. */
export function useOverviewData(platform: Platform): OverviewData {
  const open = useOverviewStore((s) => s.open);
  const layout = useOverviewStore((s) => s.layout);
  const nodesMode = useOverviewStore((s) => s.nodes);
  const epoch = useOverviewStore((s) => s.epoch);
  const spacing = useOverviewStore((s) => s.spacing);
  const items = useLibraryStore((s) => s.items);
  const placements = useLibraryStore((s) => s.placements);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);

  const [controller] = useState(() => new GraphController());
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { hubs, ready, failed, simId } = snap;
  const [run, setRun] = useState(0);
  const spacingRef = useRef(spacing);
  useEffect(() => {
    spacingRef.current = spacing;
  }, [spacing]);

  const visibleIds = useMemo(
    () =>
      [...placements.keys()].filter((id) => {
        const item = items.get(id);
        return item && !item.deletedAt;
      }),
    [placements, items],
  );
  const clustersActive = open && layout === 'clusters';
  const structureKey = `${visibleIds.join('|')}#${activeCriteria.join(',')}#${connections.size}`;

  useEffect(() => {
    if (!clustersActive) return;
    controller.start({
      visibleItemIds: visibleIds,
      activeCriteria,
      items: [...items.values()],
      itemTerms,
      terms,
      manualConnections: [...connections.values()],
      spacing: spacingRef.current,
      reduceMotion: prefersReducedMotion(),
    });
    return () => controller.stop();
    // Everything the simulation reads at the start is folded into `structureKey`; `run` restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, clustersActive, structureKey, run]);

  // Spacing is live: no restart, only a message.
  useEffect(() => {
    controller.setSpacing(spacing);
  }, [controller, spacing]);

  const retry = useCallback(() => setRun((n) => n + 1), []);
  const dragNode = useCallback(
    (id: string, x: number, y: number) => controller.drag(id, x, y),
    [controller],
  );
  const releaseNode = useCallback((id: string) => controller.release(id), [controller]);

  const model = useMemo<OverviewModel>(() => {
    if (!open) return { nodes: [], edges: [], hubs: [], tooLong: false };
    const nodes: OverviewNode[] = [];
    for (const id of visibleIds) {
      const item = items.get(id);
      const p = placements.get(id);
      if (!item || !p) continue;
      nodes.push({
        id,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        homeX: p.x + p.w / 2,
        homeY: p.y + p.h / 2,
        color: itemColorOf(item),
        title: item.title.trim() || item.fileName || item.kind,
        aspect: p.h > 0 ? p.w / p.h : 1,
        thumbUrl:
          nodesMode === 'thumbnails' && isMediaItem(item) && item.status === 'ok'
            ? thumbUrl(platform, item, 128)
            : null,
      });
    }

    const manual = [...connections.values()].map((c) => ({ fromId: c.fromId, toId: c.toId }));
    let hubInputs: OverviewHubInput[];
    let overLimit = false;
    if (layout === 'clusters') {
      hubInputs = (hubs ?? []).map((h) => ({
        criterion: h.criterion,
        value: h.value,
        itemIds: h.itemIds,
        label: h.label,
      }));
    } else {
      const index = buildConnectionIndex(items.values(), itemTerms, terms, connections.values());
      const result = computeHubs(
        visibleIds,
        activeCriteria.filter((c) => HUB_CRITERIA.includes(c)),
        index,
      );
      overLimit = result.overLimit;
      const titles = new Map(visibleIds.map((id) => [id, items.get(id)?.title ?? id] as const));
      hubInputs = result.hubs.map((h) => ({
        criterion: h.criterion,
        value: h.value,
        itemIds: h.itemIds,
        label: formatHubLabel(h, terms, titles),
      }));
    }
    return buildOverviewModel({ nodes, manual, hubs: hubInputs, overLimit });
  }, [
    open,
    layout,
    nodesMode,
    hubs,
    visibleIds,
    items,
    placements,
    itemTerms,
    terms,
    connections,
    activeCriteria,
    platform,
  ]);

  const status: OverviewData['status'] = !clustersActive
    ? 'ready'
    : failed
      ? 'failed'
      : ready
        ? 'ready'
        : 'arranging';
  const fitKey = layout === 'clusters' ? `clusters:${epoch}:${simId}:${ready}` : `mine:${epoch}`;
  return {
    model,
    live: clustersActive ? snap.live : null,
    fitKey,
    status,
    retry,
    dragNode,
    releaseNode,
  };
}
