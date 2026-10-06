import { describe, expect, it } from 'vitest';
import { GraphSimulation, buildGraphSpec, hubNodeId, type GraphSpec } from './graphSimulation';
import type { ConstellationLayout } from './constellations';

function twoHubGraph(): GraphSpec {
  const nodes: GraphSpec['nodes'] = [];
  const links: GraphSpec['links'] = [];
  for (const [h, cx] of [
    ['a', -150],
    ['b', 150],
  ] as const) {
    nodes.push({ id: `hub:${h}`, kind: 'hub', x: cx, y: 0, size: 12, unclassified: false });
    for (let i = 0; i < 12; i++) {
      const id = `${h}${i}`;
      nodes.push({
        id,
        kind: 'item',
        x: cx + Math.cos(i) * 60,
        y: Math.sin(i) * 60,
        size: 1,
        unclassified: false,
      });
      links.push({ source: id, target: `hub:${h}`, kind: 'hub', hubSize: 12 });
    }
  }
  return { nodes, links };
}

function meanHubItemDistance(sim: GraphSimulation): number {
  const pos = sim.positions();
  const at = (id: string) => {
    const i = sim.ids.indexOf(id);
    return { x: pos[i * 2], y: pos[i * 2 + 1] };
  };
  let sum = 0;
  let n = 0;
  for (const h of ['a', 'b']) {
    const hub = at(`hub:${h}`);
    for (let i = 0; i < 12; i++) {
      const p = at(`${h}${i}`);
      sum += Math.hypot(p.x - hub.x, p.y - hub.y);
      n++;
    }
  }
  return sum / n;
}

describe('GraphSimulation', () => {
  it('spacing changes the forces: a larger Spacing spreads the groups, node sizes stay put', () => {
    const tight = new GraphSimulation(twoHubGraph(), 0.5);
    tight.settle();
    const wide = new GraphSimulation(twoHubGraph(), 2);
    wide.settle();
    expect(meanHubItemDistance(wide)).toBeGreaterThan(meanHubItemDistance(tight) * 1.5);
  });

  it('changing Spacing live re-heats and moves an already settled graph', () => {
    const sim = new GraphSimulation(twoHubGraph(), 1);
    sim.settle();
    const before = meanHubItemDistance(sim);
    expect(sim.active).toBe(false);
    sim.setSpacing(2);
    expect(sim.active).toBe(true);
    sim.settle();
    expect(meanHubItemDistance(sim)).toBeGreaterThan(before * 1.3);
    sim.setSpacing(0.7);
    sim.settle();
    expect(meanHubItemDistance(sim)).toBeLessThan(before);
  });

  it('a dragged node follows the pointer and its neighbours follow it', () => {
    const sim = new GraphSimulation(twoHubGraph(), 1);
    sim.settle();
    const index = sim.ids.indexOf('hub:a');
    const itemIndex = sim.ids.indexOf('a0');
    const before = sim.positions();
    sim.drag('hub:a', before[index * 2] - 400, before[index * 2 + 1]);
    for (let i = 0; i < 60; i++) sim.tick();
    const during = sim.positions();
    expect(during[index * 2]).toBeCloseTo(before[index * 2] - 400, 3);
    // an item of that hub moved left too
    expect(during[itemIndex * 2]).toBeLessThan(before[itemIndex * 2] - 150);
  });

  it('after release it settles within a few seconds of ticks', () => {
    const sim = new GraphSimulation(twoHubGraph(), 1);
    sim.settle();
    sim.drag('a0', 500, 500);
    for (let i = 0; i < 10; i++) sim.tick();
    sim.release('a0');
    let ticks = 0;
    while (sim.tick() && ticks < 1000) ticks++;
    expect(sim.active).toBe(false);
    expect(ticks).toBeLessThan(260); // ≈ 4 s at 60 ticks per second at most
    expect(ticks).toBeGreaterThan(60);
  });

  it('positions come back in the order of ids', () => {
    const sim = new GraphSimulation(twoHubGraph(), 1);
    expect(sim.positions()).toHaveLength(sim.ids.length * 2);
    expect(sim.ids[0]).toBe('hub:a');
  });
});

describe('buildGraphSpec', () => {
  it('makes item nodes, hub nodes, item–hub links and manual links', () => {
    const layout: ConstellationLayout = {
      itemPositions: new Map([
        ['i1', { x: 0, y: 0 }],
        ['i2', { x: 10, y: 0 }],
        ['i3', { x: 99, y: 99 }],
      ]),
      hubs: [
        {
          id: 'tag:sun',
          criterion: 'tag',
          value: 'sun',
          label: 'Sun',
          x: 5,
          y: 5,
          itemIds: ['i1', 'i2', 'gone'],
        },
      ],
      unclassifiedIds: ['i3'],
    };
    const spec = buildGraphSpec(
      layout,
      ['i1', 'i2', 'i3'],
      [
        { fromId: 'i1', toId: 'i3' },
        { fromId: 'i1', toId: 'nope' },
      ],
    );
    expect(spec.nodes.map((n) => n.id)).toEqual(['i1', 'i2', 'i3', hubNodeId('tag:sun')]);
    expect(spec.nodes.find((n) => n.id === 'i3')?.unclassified).toBe(true);
    expect(spec.nodes.find((n) => n.kind === 'hub')?.size).toBe(2);
    expect(spec.links.filter((l) => l.kind === 'hub')).toHaveLength(2);
    expect(spec.links.filter((l) => l.kind === 'manual')).toEqual([
      { source: 'i1', target: 'i3', kind: 'manual', hubSize: 0 },
    ]);
  });
});
