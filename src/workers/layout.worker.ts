/// <reference lib="webworker" />
import { buildConnectionIndex, type Criterion } from '@/lib/connections';
import { computeConstellationLayout, type ConstellationLayout } from '@/lib/constellations';
import type { Item, ManualConnection, Term } from '@/state/types';

declare const self: DedicatedWorkerGlobalScope;

export interface LayoutRequest {
  id: string;
  visibleItemIds: string[];
  activeCriteria: Criterion[];
  items: Item[];
  itemTerms: Map<string, Set<string>>;
  terms: Map<string, Term>;
  manualConnections: ManualConnection[];
  /** `similar` ("Similar look", §4.10) — omitted (not just empty) when no embeddings are
   * available at all, same convention `buildConnectionIndex` uses. */
  embeddings?: Map<string, Float32Array>;
  /** Overview's Spacing slider; multiplies every layout distance. Default 1. */
  spacing?: number;
}

export interface LayoutResponse extends ConstellationLayout {
  id: string;
}

/** §4.9 clusters layout, off the main thread — CLAUDE.md's "Ingest, layout and AI run in
 * workers". Rebuilds the connection index here (mirroring how `ingest.worker.ts` takes raw bytes
 * rather than a pre-decoded image) instead of receiving a pre-built `ConnectionIndex`, since Maps
 * of Maps of Sets structured-clone fine either way but the source arrays are simpler to reason
 * about at the call site in `useOverviewData`. */
self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const req = event.data;
  const index = buildConnectionIndex(
    req.items,
    req.itemTerms,
    req.terms,
    req.manualConnections,
    req.embeddings,
  );
  const itemTitles = new Map(req.items.map((i) => [i.id, i.title]));
  const layout = computeConstellationLayout(
    req.visibleItemIds,
    req.activeCriteria,
    index,
    req.terms,
    itemTitles,
    { spacing: req.spacing },
  );
  const response: LayoutResponse = { id: req.id, ...layout };
  self.postMessage(response);
};
