import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { computeHubs, formatHubLabel, type Criterion, type ConnectionIndex } from './connections';
import type { Term } from '@/state/types';

/** A tiny, fast, seeded PRNG (mulberry32) — good enough for layout jitter, not cryptography.
 * Deterministic for a given 32-bit seed, which is what §4.9's "same inputs always give the same
 * layout" needs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** §4.9: "The seed is a hash of the criteria and item ids." FNV-1a 32-bit over the parts joined
 * with a separator that can't appear in an id/criterion name, so `['ab','c']` and `['a','bc']`
 * hash differently. */
export function hashSeed(parts: readonly string[]): number {
  let h = 0x811c9dc5;
  const joined = parts.join('\u0000');
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface HubNode extends SimulationNodeDatum {
  id: string;
  criterion: Criterion;
  value: string;
  itemIds: string[];
  size: number;
}

interface HubLink {
  source: string;
  target: string;
  weight: number;
}

interface ItemNode extends SimulationNodeDatum {
  id: string;
  targetX: number;
  targetY: number;
}

export interface ConstellationHub {
  id: string;
  criterion: Criterion;
  value: string;
  label: string;
  x: number;
  y: number;
  itemIds: string[];
}

export interface ConstellationLayout {
  itemPositions: Map<string, { x: number; y: number }>;
  hubs: ConstellationHub[];
  /** Items with no value for any active criterion — placed on the outer "Unclassified" ring. */
  unclassifiedIds: string[];
}

// Step 2: the hub graph (§4.9) — charge ∝ -√size, link distance decreasing with weight, collide
// radius ∝ √size. The plan states the proportionality, not exact constants; these are tuned so a
// handful of hubs spread out readably at the map's normal zoom scale (world units, same as
// everything else on the canvas).
const HUB_CHARGE_K = 30;
const HUB_LINK_BASE_DISTANCE = 220;
const HUB_LINK_MIN_DISTANCE = 60;
const HUB_LINK_DISTANCE_PER_WEIGHT = 15;
const HUB_COLLIDE_K = 18;
const HUB_TICKS = 300;

// Step 3/4: item placement + relax (§4.9) — uniform card size (long side 160), a ring radius for
// single/multi-hub jitter, and a weak pull back toward the step-3 target during the collide pass.
const ITEM_CARD_LONG_SIDE = 160;
const ITEM_COLLIDE_RADIUS = ITEM_CARD_LONG_SIDE / 2 + 8;
const ITEM_TARGET_PULL_STRENGTH = 0.12;
const ITEM_TICKS = 120;
const SINGLE_HUB_RING_RADIUS = ITEM_CARD_LONG_SIDE * 1.4;
const MULTI_HUB_JITTER_RADIUS = SINGLE_HUB_RING_RADIUS * 0.4;
const UNCLASSIFIED_RING_PADDING = ITEM_CARD_LONG_SIDE * 2;

function buildHubLinks(nodes: HubNode[]): HubLink[] {
  const links: HubLink[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const setI = new Set(nodes[i].itemIds);
    for (let j = i + 1; j < nodes.length; j++) {
      const weight = nodes[j].itemIds.filter((id) => setI.has(id)).length;
      if (weight > 0) links.push({ source: nodes[i].id, target: nodes[j].id, weight });
    }
  }
  return links;
}

/**
 * §4.9's Constellations algorithm: build hubs for the active criteria, lay out the hub graph with
 * d3-force (seeded, deterministic), place each item at the weighted average of its hubs plus
 * seeded jitter (a ring for single-hub items, an outer ring for hub-less "Unclassified" items),
 * then relax the whole item set against uniform-size collision with a weak pull back toward those
 * targets. Runs synchronously — the caller (`workers/layout.worker.ts`) is what keeps this off
 * the main thread, not anything in here.
 *
 * `similar` ("Similar look") is deferred to M6 like everywhere else in M3 — the plan's "adds
 * item-to-item link forces instead of hubs" is a real difference from every other criterion, and
 * isn't worth building against an index that's always empty until the AI pipeline exists.
 */
export function computeConstellationLayout(
  visibleItemIds: string[],
  activeCriteria: Criterion[],
  index: ConnectionIndex,
  terms: Map<string, Term>,
  itemTitles: Map<string, string>,
): ConstellationLayout {
  const seed = hashSeed([...activeCriteria, ...[...visibleItemIds].sort()]);
  const random = mulberry32(seed);

  // Step 1: hubs — a value with only one visible item never becomes one.
  const { hubs } = computeHubs(visibleItemIds, activeCriteria, index);

  // Step 2: lay out the hub graph.
  const hubNodes: HubNode[] = hubs.map((h) => ({
    id: `${h.criterion}:${h.value}`,
    criterion: h.criterion,
    value: h.value,
    itemIds: h.itemIds,
    size: h.itemIds.length,
    x: (random() - 0.5) * 100,
    y: (random() - 0.5) * 100,
  }));
  const hubLinks = buildHubLinks(hubNodes);

  if (hubNodes.length > 0) {
    forceSimulation(hubNodes)
      .randomSource(random)
      .force(
        'charge',
        forceManyBody<HubNode>().strength((d) => -HUB_CHARGE_K * Math.sqrt(d.size)),
      )
      .force(
        'link',
        forceLink<HubNode, HubLink>(hubLinks)
          .id((d) => d.id)
          .distance((l) =>
            Math.max(
              HUB_LINK_MIN_DISTANCE,
              HUB_LINK_BASE_DISTANCE - l.weight * HUB_LINK_DISTANCE_PER_WEIGHT,
            ),
          ),
      )
      .force(
        'collide',
        forceCollide<HubNode>().radius((d) => HUB_COLLIDE_K * Math.sqrt(d.size)),
      )
      .force('center', forceCenter(0, 0))
      .stop()
      .tick(HUB_TICKS);
  }

  const hubsByItem = new Map<string, HubNode[]>();
  for (const hub of hubNodes) {
    for (const itemId of hub.itemIds) {
      const list = hubsByItem.get(itemId);
      if (list) list.push(hub);
      else hubsByItem.set(itemId, [hub]);
    }
  }
  const unclassifiedRadius =
    hubNodes.reduce((max, h) => Math.max(max, Math.hypot(h.x ?? 0, h.y ?? 0)), 0) +
    UNCLASSIFIED_RING_PADDING;

  // Step 3: place each item at the weighted average of its hubs, plus seeded jitter.
  const targets = new Map<string, { x: number; y: number }>();
  const unclassifiedIds: string[] = [];

  for (const itemId of visibleItemIds) {
    const memberHubs = hubsByItem.get(itemId);
    if (!memberHubs || memberHubs.length === 0) {
      unclassifiedIds.push(itemId);
      const angle = random() * Math.PI * 2;
      targets.set(itemId, {
        x: Math.cos(angle) * unclassifiedRadius,
        y: Math.sin(angle) * unclassifiedRadius,
      });
      continue;
    }
    const avgX = memberHubs.reduce((s, h) => s + (h.x ?? 0), 0) / memberHubs.length;
    const avgY = memberHubs.reduce((s, h) => s + (h.y ?? 0), 0) / memberHubs.length;
    const jitterRadius = memberHubs.length === 1 ? SINGLE_HUB_RING_RADIUS : MULTI_HUB_JITTER_RADIUS;
    const angle = random() * Math.PI * 2;
    targets.set(itemId, {
      x: avgX + Math.cos(angle) * jitterRadius,
      y: avgY + Math.sin(angle) * jitterRadius,
    });
  }

  // Step 4: relax with the hubs fixed — uniform-size collision plus a weak pull toward targets.
  const itemNodes: ItemNode[] = visibleItemIds.map((id) => {
    const t = targets.get(id)!;
    return { id, targetX: t.x, targetY: t.y, x: t.x, y: t.y };
  });

  if (itemNodes.length > 0) {
    forceSimulation(itemNodes)
      .randomSource(random)
      .force('collide', forceCollide<ItemNode>().radius(ITEM_COLLIDE_RADIUS))
      .force('x', forceX<ItemNode>((d) => d.targetX).strength(ITEM_TARGET_PULL_STRENGTH))
      .force('y', forceY<ItemNode>((d) => d.targetY).strength(ITEM_TARGET_PULL_STRENGTH))
      .stop()
      .tick(ITEM_TICKS);
  }

  const itemPositions = new Map(itemNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  const resultHubs: ConstellationHub[] = hubNodes.map((h) => ({
    id: h.id,
    criterion: h.criterion,
    value: h.value,
    label: formatHubLabel(h, terms, itemTitles),
    x: h.x ?? 0,
    y: h.y ?? 0,
    itemIds: h.itemIds,
  }));

  return { itemPositions, hubs: resultHubs, unclassifiedIds };
}
