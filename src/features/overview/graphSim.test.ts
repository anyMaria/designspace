import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphSim, GRAPH_SIM_TIMEOUT_MS } from './graphSim';
import type { WorkerLike } from '@/workers/ingestQueue';
import type { GraphInit, GraphSimResponse } from '@/workers/graphSim.protocol';

function fakeWorker() {
  const sent: unknown[] = [];
  const worker: WorkerLike = {
    postMessage: (m) => void sent.push(m),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  };
  const reply = (m: GraphSimResponse) =>
    worker.onmessage?.({ data: m } as MessageEvent<GraphSimResponse>);
  return { worker, sent, reply };
}

const init = { spacing: 1, reduceMotion: false } as unknown as GraphInit;

function setup(timeoutMs?: number) {
  const f = fakeWorker();
  const events = {
    onGraph: vi.fn(),
    onFrame: vi.fn(),
    onSettled: vi.fn(),
    onError: vi.fn(),
  };
  const sim = new GraphSim(() => f.worker, events, timeoutMs);
  return { ...f, events, sim };
}

describe('GraphSim', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends init, then applies the graph and frames it receives', () => {
    const { sim, sent, reply, events } = setup();
    sim.init(init);
    expect(sent[0]).toMatchObject({ type: 'init' });

    reply({ type: 'graph', ids: ['a', 'hub:x'], hubs: [] });
    expect(events.onGraph).toHaveBeenCalledWith([]);
    expect(sim.live.ready).toBe(false);

    reply({ type: 'frame', positions: new Float32Array([1, 2, 3, 4]) });
    expect(events.onFrame).toHaveBeenCalledTimes(1);
    expect(sim.live.get('a')).toEqual({ x: 1, y: 2 });
    expect(sim.live.get('hub:x')).toEqual({ x: 3, y: 4 });
    expect(sim.live.get('nope')).toBeUndefined();

    reply({ type: 'frame', positions: new Float32Array([5, 6, 7, 8]) });
    expect(sim.live.get('a')).toEqual({ x: 5, y: 6 });
    reply({ type: 'settled' });
    expect(events.onSettled).toHaveBeenCalled();
  });

  it('forwards drag, release and spacing', () => {
    const { sim, sent } = setup();
    sim.drag('a', 10, 20);
    sim.release('a');
    sim.setSpacing(1.5);
    expect(sent).toEqual([
      { type: 'drag', id: 'a', x: 10, y: 20 },
      { type: 'release', id: 'a' },
      { type: 'spacing', value: 1.5 },
    ]);
  });

  it('reports an error when nothing arrives in time', () => {
    const { sim, events } = setup();
    sim.init(init);
    vi.advanceTimersByTime(GRAPH_SIM_TIMEOUT_MS + 1);
    expect(events.onError).toHaveBeenCalledTimes(1);
  });

  it('does not time out once a frame has arrived', () => {
    const { sim, reply, events } = setup();
    sim.init(init);
    reply({ type: 'graph', ids: ['a'], hubs: [] });
    reply({ type: 'frame', positions: new Float32Array([0, 0]) });
    vi.advanceTimersByTime(GRAPH_SIM_TIMEOUT_MS * 2);
    expect(events.onError).not.toHaveBeenCalled();
  });

  it('passes on a worker error, and stop() ends everything', () => {
    const { sim, reply, worker, events, sent } = setup();
    reply({ type: 'error', message: 'boom' });
    expect(events.onError).toHaveBeenCalledWith('boom');
    sim.stop();
    expect(worker.terminate).toHaveBeenCalled();
    sim.drag('a', 1, 1);
    expect(sent.filter((m) => (m as { type: string }).type === 'drag')).toHaveLength(0);
    reply({ type: 'frame', positions: new Float32Array([0, 0]) });
    expect(events.onFrame).not.toHaveBeenCalled();
  });
});
