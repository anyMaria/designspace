import { describe, expect, it } from 'vitest';
import { buildOverviewModel, nodeAt, type OverviewNode } from './overviewModel';

const node = (id: string, x: number, y: number): OverviewNode => ({
  id,
  x,
  y,
  color: 0xffffff,
  title: id,
  aspect: 1,
  thumbUrl: null,
});

describe('buildOverviewModel', () => {
  const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 0, 100)];

  it('makes member→hub edges (n lines) and a centroid hub', () => {
    const m = buildOverviewModel({
      nodes,
      manual: [],
      hubs: [{ criterion: 'tag', value: 't', itemIds: ['a', 'b', 'c'], label: 'Grain' }],
      overLimit: false,
    });
    expect(m.hubs).toHaveLength(1);
    expect(m.hubs[0].x).toBeCloseTo(100 / 3);
    expect(m.edges).toHaveLength(3);
    expect(m.edges.every((e) => e.bId === 'hub:0' && !e.manual)).toBe(true);
  });

  it('uses a hub’s own position when given, skips hubs with fewer than two known items', () => {
    const m = buildOverviewModel({
      nodes,
      manual: [],
      hubs: [
        { criterion: 'vibe', value: 'v', itemIds: ['a', 'b'], label: 'Dreamy', x: 5, y: 6 },
        { criterion: 'vibe', value: 'w', itemIds: ['a', 'zzz'], label: 'Gone' },
      ],
      overLimit: false,
    });
    expect(m.hubs).toHaveLength(1);
    expect(m.hubs[0]).toMatchObject({ x: 5, y: 6 });
  });

  it('draws My connections as direct white lines, ignoring unknown items and manual hubs', () => {
    const m = buildOverviewModel({
      nodes,
      manual: [
        { fromId: 'a', toId: 'b' },
        { fromId: 'a', toId: 'gone' },
      ],
      hubs: [{ criterion: 'manual', value: 'b', itemIds: ['a', 'b'], label: 'B' }],
      overLimit: false,
    });
    expect(m.edges).toEqual([{ aId: 'a', bId: 'b', criterion: 'manual', manual: true }]);
    expect(m.hubs).toHaveLength(0);
  });

  it('above the cap keeps only My connections and flags tooLong', () => {
    const m = buildOverviewModel({
      nodes,
      manual: [{ fromId: 'a', toId: 'b' }],
      hubs: [{ criterion: 'tag', value: 't', itemIds: ['a', 'b'], label: 'x' }],
      overLimit: true,
    });
    expect(m.tooLong).toBe(true);
    expect(m.hubs).toHaveLength(0);
    expect(m.edges).toHaveLength(1);
  });
});

describe('nodeAt', () => {
  const screen = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 108, y: 100 },
  ];
  it('picks the nearest node within the radius', () => {
    expect(nodeAt(screen, 106, 100)).toBe('b');
    expect(nodeAt(screen, 101, 100)).toBe('a');
  });
  it('returns null when nothing is close enough', () => {
    expect(nodeAt(screen, 300, 300)).toBeNull();
    expect(nodeAt([], 0, 0)).toBeNull();
  });
});
