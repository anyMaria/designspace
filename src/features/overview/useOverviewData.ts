import { useEffect, useMemo, useState } from 'react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import {
  buildConnectionIndex,
  computeHubs,
  formatHubLabel,
  type Criterion,
} from '@/lib/connections';
import { itemColorOf } from '@/lib/itemColor';
import { thumbUrl } from '@/lib/thumbs';
import { isMediaKind } from '@/lib/itemKinds';
import { logger } from '@/lib/logger';
import {
  defaultLayoutWorkerFactory,
  runConstellationLayout,
} from '@/workers/runConstellationLayout';
import type { ConstellationLayout } from '@/lib/constellations';
import { useOverviewStore } from './overviewStore';
import {
  buildOverviewModel,
  type OverviewHubInput,
  type OverviewModel,
  type OverviewNode,
} from './overviewModel';

// Criteria drawn as hubs: "similar" has no discrete value and "manual" is drawn as direct lines.
const HUB_CRITERIA: Criterion[] = ['type', 'vibe', 'movement', 'tag', 'color'];

/** The Overview's model for the current space (Patch 1 · G2). "My layout" uses real positions;
 * "Clusters" runs the clusters layout worker with the active criteria and caches the result
 * until the items or criteria change. */
export function useOverviewData(platform: Platform): { model: OverviewModel; arranging: boolean } {
  const open = useOverviewStore((s) => s.open);
  const layout = useOverviewStore((s) => s.layout);
  const nodesMode = useOverviewStore((s) => s.nodes);
  const items = useLibraryStore((s) => s.items);
  const placements = useLibraryStore((s) => s.placements);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const embeddings = useEmbeddingsStore((s) => s.vectors);
  const spacing = useOverviewStore((s) => s.spacing);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const [clusters, setClusters] = useState<{ key: string; layout: ConstellationLayout } | null>(
    null,
  );

  const visibleIds = useMemo(
    () =>
      [...placements.keys()].filter((id) => {
        const item = items.get(id);
        return item && !item.deletedAt;
      }),
    [placements, items],
  );
  const criteriaKey = activeCriteria.join(',');
  const clustersKey = `${visibleIds.join('|')}#${criteriaKey}#${connections.size}#${spacing}`;

  useEffect(() => {
    if (!open || layout !== 'clusters' || clusters?.key === clustersKey) return;
    let cancelled = false;
    const worker = defaultLayoutWorkerFactory();
    runConstellationLayout(worker, {
      visibleItemIds: visibleIds,
      activeCriteria,
      items: [...items.values()],
      itemTerms,
      terms,
      manualConnections: [...connections.values()],
      embeddings,
      spacing,
    })
      .then((result) => {
        if (!cancelled) setClusters({ key: clustersKey, layout: result });
      })
      .catch((err: unknown) => logger.error('Overview cluster layout failed', err))
      .finally(() => worker.terminate());
    return () => {
      cancelled = true;
      worker.terminate();
    };
    // Everything the layout reads is folded into `clustersKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layout, clustersKey]);

  const arranging = open && layout === 'clusters' && clusters?.key !== clustersKey;

  const model = useMemo<OverviewModel>(() => {
    if (!open) return { nodes: [], edges: [], hubs: [], tooLong: false };
    const useClusters = layout === 'clusters' && clusters?.key === clustersKey;
    const nodes: OverviewNode[] = [];
    for (const id of visibleIds) {
      const item = items.get(id);
      const p = placements.get(id);
      if (!item || !p) continue;
      const at = useClusters ? clusters.layout.itemPositions.get(id) : undefined;
      nodes.push({
        id,
        x: at ? at.x : p.x + p.w / 2,
        y: at ? at.y : p.y + p.h / 2,
        homeX: p.x + p.w / 2,
        homeY: p.y + p.h / 2,
        color: itemColorOf(item),
        title: item.title.trim() || item.fileName || item.kind,
        aspect: p.h > 0 ? p.w / p.h : 1,
        thumbUrl:
          nodesMode === 'thumbnails' && isMediaKind(item.kind) && item.status === 'ok'
            ? thumbUrl(platform, item, 128)
            : null,
      });
    }

    const manual = [...connections.values()].map((c) => ({ fromId: c.fromId, toId: c.toId }));
    let hubs: OverviewHubInput[];
    let overLimit = false;
    if (useClusters) {
      hubs = clusters.layout.hubs.map((h) => ({
        criterion: h.criterion,
        value: h.value,
        itemIds: h.itemIds,
        label: h.label,
        x: h.x,
        y: h.y,
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
      hubs = result.hubs.map((h) => ({
        criterion: h.criterion,
        value: h.value,
        itemIds: h.itemIds,
        label: formatHubLabel(h, terms, titles),
      }));
    }
    return buildOverviewModel({ nodes, manual, hubs, overLimit });
  }, [
    open,
    layout,
    nodesMode,
    clusters,
    clustersKey,
    visibleIds,
    items,
    placements,
    itemTerms,
    terms,
    connections,
    activeCriteria,
    platform,
  ]);

  return { model, arranging };
}
