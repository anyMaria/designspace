import type { Criterion } from '@/lib/connections';

export interface OverviewNode {
  id: string;
  x: number;
  y: number;
  /** Packed 0xRRGGBB card colour. */
  color: number;
  title: string;
  /** width / height of the card, so thumbnails keep their shape. */
  aspect: number;
  /** The `t128` thumbnail URL, or null for items that have none (notes, swatches, not ready). */
  thumbUrl: string | null;
  /** Where the node was in My layout, so a new layout can settle from there (Patch 2 · B2). */
  homeX?: number;
  homeY?: number;
}

export interface OverviewHubInput {
  criterion: Criterion;
  value: string;
  itemIds: string[];
  label: string;
  /** Where the hub sits; when missing it is the centroid of its members. */
  x?: number;
  y?: number;
}

export interface OverviewHub {
  id: string;
  /** Stable across layouts (`criterion:value`), so a clicked star can stay clicked. */
  key: string;
  x: number;
  y: number;
  label: string;
  criterion: Criterion;
  itemIds: string[];
}

export interface OverviewEdge {
  /** A node id or a hub id (`hub:<n>`). */
  aId: string;
  bId: string;
  criterion: Criterion;
  manual: boolean;
}

export interface OverviewModel {
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  hubs: OverviewHub[];
  /** Too many links to draw: only My connections are kept (the caller shows `en.overview.tooLong`). */
  tooLong: boolean;
}

export interface OverviewInput {
  nodes: OverviewNode[];
  manual: { fromId: string; toId: string }[];
  hubs: OverviewHubInput[];
  overLimit: boolean;
}

/** Nodes, edges and hubs for the Overview (Patch 1 · G2). Edges: My connections as direct lines,
 * and every other criterion as member → hub lines (n lines, not n²). Manual hubs are skipped (their
 * "hub" is another item, already drawn as a direct line). Above the line cap only My connections
 * remain. */
export function buildOverviewModel(input: OverviewInput): OverviewModel {
  const known = new Set(input.nodes.map((n) => n.id));
  const pos = new Map(input.nodes.map((n) => [n.id, n] as const));
  const edges: OverviewEdge[] = [];
  const hubs: OverviewHub[] = [];

  for (const c of input.manual) {
    if (known.has(c.fromId) && known.has(c.toId)) {
      edges.push({ aId: c.fromId, bId: c.toId, criterion: 'manual', manual: true });
    }
  }

  if (!input.overLimit) {
    for (const h of input.hubs) {
      if (h.criterion === 'manual') continue;
      const members = h.itemIds.filter((id) => known.has(id));
      if (members.length < 2) continue;
      const cx = h.x ?? members.reduce((s, id) => s + (pos.get(id)?.x ?? 0), 0) / members.length;
      const cy = h.y ?? members.reduce((s, id) => s + (pos.get(id)?.y ?? 0), 0) / members.length;
      const id = `hub:${hubs.length}`;
      hubs.push({
        id,
        key: `${h.criterion}:${h.value}`,
        x: cx,
        y: cy,
        label: h.label,
        criterion: h.criterion,
        itemIds: members,
      });
      for (const m of members)
        edges.push({ aId: m, bId: id, criterion: h.criterion, manual: false });
    }
  }
  return { nodes: input.nodes, edges, hubs, tooLong: input.overLimit };
}

/** The node nearest to a screen point and within `radius` px, or null — used for hover and
 * double-click so both agree on what "on a node" means. */
export function nodeAt(
  screenNodes: readonly { id: string; x: number; y: number }[],
  x: number,
  y: number,
  radius = 10,
): string | null {
  let best: string | null = null;
  let bestD = radius * radius;
  for (const n of screenNodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}
