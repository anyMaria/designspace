import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { ConstellationLayout } from './constellations';

/** The Overview's live graph (Patch 3 · D1): items and hubs (the stars) are all nodes of one
 * d3-force simulation, so dragging one makes its neighbours follow on springs. Spacing changes the
 * forces (link length and repulsion), never the size of a dot, so the groups visibly loosen or
 * tighten in place (D3). Pure and synchronous; `workers/graphSim.worker.ts` runs it off the main
 * thread. */

export interface GraphNodeSpec {
  id: string;
  kind: 'item' | 'hub';
  x: number;
  y: number;
  /** A hub: how many items it holds. */
  size: number;
  /** An item with no hub: held on an outer ring. */
  unclassified: boolean;
}

export interface GraphLinkSpec {
  source: string;
  target: string;
  kind: 'hub' | 'manual';
  /** A hub link: the size of that hub, so big groups sit a little further out. */
  hubSize: number;
}

export interface GraphSpec {
  nodes: GraphNodeSpec[];
  links: GraphLinkSpec[];
}

/** The id the simulation (and the Overview canvas) gives a hub: `hub:` + `criterion:value`. */
export const hubNodeId = (hubId: string): string => `hub:${hubId}`;

/** Turns the seed layout (the static Clusters layout) into nodes and links: one link from each item
 * to each of its hubs, and one per manual connection between two visible items. */
export function buildGraphSpec(
  layout: ConstellationLayout,
  visibleItemIds: string[],
  manual: { fromId: string; toId: string }[],
): GraphSpec {
  const nodes: GraphNodeSpec[] = [];
  const links: GraphLinkSpec[] = [];
  const unclassified = new Set(layout.unclassifiedIds);
  const known = new Set<string>();
  for (const id of visibleItemIds) {
    const at = layout.itemPositions.get(id);
    if (!at) continue;
    known.add(id);
    nodes.push({ id, kind: 'item', x: at.x, y: at.y, size: 1, unclassified: unclassified.has(id) });
  }
  for (const hub of layout.hubs) {
    const id = hubNodeId(hub.id);
    const members = hub.itemIds.filter((m) => known.has(m));
    nodes.push({ id, kind: 'hub', x: hub.x, y: hub.y, size: members.length, unclassified: false });
    for (const m of members)
      links.push({ source: m, target: id, kind: 'hub', hubSize: members.length });
  }
  for (const c of manual) {
    if (known.has(c.fromId) && known.has(c.toId) && c.fromId !== c.toId)
      links.push({ source: c.fromId, target: c.toId, kind: 'manual', hubSize: 0 });
  }
  return { nodes, links };
}

// Forces. Distances and charges are multiplied by Spacing; the collision radii are not.
const HUB_LINK_BASE = 34;
const HUB_LINK_PER_SQRT_SIZE = 7;
const HUB_LINK_STRENGTH = 0.32;
const MANUAL_LINK_DISTANCE = 110;
const MANUAL_LINK_STRENGTH = 0.12;
const ITEM_CHARGE = 26;
const HUB_CHARGE = 90;
const CHARGE_MAX_DISTANCE = 900;
const ITEM_COLLIDE_RADIUS = 20;
const HUB_COLLIDE_RADIUS = 14;
const CENTER_PULL = 0.012;
const RING_PULL = 0.06;
const ALPHA_MIN = 0.001;
/** About 140 ticks (2–3 s at 60 fps) from a drag's alpha to rest. */
const ALPHA_DECAY = 0.04;
const REHEAT_ALPHA = 0.3;
const MAX_SETTLE_TICKS = 600;

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: 'item' | 'hub';
  size: number;
  unclassified: boolean;
}
interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  kind: 'hub' | 'manual';
  hubSize: number;
}

export class GraphSimulation {
  readonly ids: string[];
  private readonly nodes: SimNode[];
  private readonly byId = new Map<string, SimNode>();
  private readonly sim: Simulation<SimNode, SimLink>;
  private readonly linkForce: ReturnType<typeof forceLink<SimNode, SimLink>>;
  private readonly chargeForce: ReturnType<typeof forceManyBody<SimNode>>;
  private ringRadius = 0;
  private spacing: number;

  constructor(spec: GraphSpec, spacing = 1) {
    this.spacing = spacing;
    this.nodes = spec.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      size: n.size,
      unclassified: n.unclassified,
      x: n.x,
      y: n.y,
    }));
    this.ids = this.nodes.map((n) => n.id);
    for (const n of this.nodes) this.byId.set(n.id, n);

    // The outer ring for hub-less items sits where the seed layout put them.
    const ring = this.nodes.filter((n) => n.unclassified);
    this.ringRadius =
      ring.length > 0
        ? ring.reduce((s, n) => s + Math.hypot(n.x ?? 0, n.y ?? 0), 0) / ring.length / spacing
        : 0;

    const links: SimLink[] = spec.links.map((l) => ({ ...l }));
    this.linkForce = forceLink<SimNode, SimLink>(links)
      .id((d) => d.id)
      .distance((l) => this.linkDistance(l))
      .strength((l) => (l.kind === 'hub' ? HUB_LINK_STRENGTH : MANUAL_LINK_STRENGTH));
    this.chargeForce = forceManyBody<SimNode>()
      .strength((d) => this.charge(d))
      .distanceMax(CHARGE_MAX_DISTANCE);
    this.sim = forceSimulation<SimNode, SimLink>(this.nodes)
      .randomSource(mulberry())
      .force('link', this.linkForce as Force<SimNode, SimLink>)
      .force('charge', this.chargeForce)
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) =>
          d.kind === 'hub' ? HUB_COLLIDE_RADIUS : ITEM_COLLIDE_RADIUS,
        ),
      )
      .force('x', forceX<SimNode>(0).strength(CENTER_PULL))
      .force('y', forceY<SimNode>(0).strength(CENTER_PULL))
      .force(
        'ring',
        forceRadial<SimNode>(() => this.ringRadius * this.spacing, 0, 0).strength((d) =>
          d.unclassified ? RING_PULL : 0,
        ),
      )
      .alphaMin(ALPHA_MIN)
      .alphaDecay(ALPHA_DECAY)
      .alpha(REHEAT_ALPHA)
      .stop();
  }

  private linkDistance(l: SimLink): number {
    return (
      this.spacing *
      (l.kind === 'hub'
        ? HUB_LINK_BASE + HUB_LINK_PER_SQRT_SIZE * Math.sqrt(l.hubSize)
        : MANUAL_LINK_DISTANCE)
    );
  }

  private charge(d: SimNode): number {
    return (
      -this.spacing * (d.kind === 'hub' ? HUB_CHARGE * Math.sqrt(Math.max(1, d.size)) : ITEM_CHARGE)
    );
  }

  /** The simulation is still moving. */
  get active(): boolean {
    return this.sim.alpha() >= ALPHA_MIN || this.sim.alphaTarget() > 0;
  }

  /** One step. Returns true while there is more to do. */
  tick(): boolean {
    if (!this.active) return false;
    this.sim.tick();
    return this.active;
  }

  /** Runs to rest in one go (Reduce motion, and tests). */
  settle(): void {
    for (let i = 0; i < MAX_SETTLE_TICKS && this.tick(); i++) {
      // keep ticking
    }
  }

  /** `[x0, y0, x1, y1, …]` in the order of `ids`; a fresh array each time, ready to transfer. */
  positions(): Float32Array {
    const out = new Float32Array(this.nodes.length * 2);
    this.nodes.forEach((n, i) => {
      out[i * 2] = n.x ?? 0;
      out[i * 2 + 1] = n.y ?? 0;
    });
    return out;
  }

  /** Holds a node under the pointer; the rest keep moving around it. */
  drag(id: string, x: number, y: number, hot = true): void {
    const n = this.byId.get(id);
    if (!n) return;
    n.fx = x;
    n.fy = y;
    n.x = x;
    n.y = y;
    if (hot) this.sim.alphaTarget(REHEAT_ALPHA);
  }

  /** Lets go: the neighbours spring back and everything settles. */
  release(id: string): void {
    const n = this.byId.get(id);
    if (!n) return;
    n.fx = null;
    n.fy = null;
    this.sim.alphaTarget(0);
    if (this.sim.alpha() < REHEAT_ALPHA) this.sim.alpha(REHEAT_ALPHA);
  }

  /** The Spacing slider: new link lengths and repulsion, then a gentle re-heat. */
  setSpacing(value: number): void {
    if (value === this.spacing) return;
    this.spacing = value;
    this.linkForce.distance((l) => this.linkDistance(l));
    this.chargeForce.strength((d) => this.charge(d));
    this.sim.alpha(REHEAT_ALPHA);
  }
}

/** A small seeded PRNG, so the same graph always starts the same way. */
function mulberry(seed = 0x9e3779b9): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
