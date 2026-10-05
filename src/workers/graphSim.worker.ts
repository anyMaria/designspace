/// <reference lib="webworker" />
import { buildConnectionIndex } from '@/lib/connections';
import { computeConstellationLayout } from '@/lib/constellations';
import { GraphSimulation, buildGraphSpec } from '@/lib/graphSimulation';
import type { Criterion } from '@/lib/connections';
import type { GraphSimRequest, GraphSimResponse } from './graphSim.protocol';

declare const self: DedicatedWorkerGlobalScope;

// Criteria drawn as stars: "similar" has no discrete value and "manual" is drawn as direct lines.
const HUB_CRITERIA: Criterion[] = ['type', 'vibe', 'movement', 'tag', 'color'];
const FRAME_MS = 16;

let sim: GraphSimulation | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let reduceMotion = false;

function post(message: GraphSimResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function postFrame(): void {
  if (!sim) return;
  const positions = sim.positions();
  post({ type: 'frame', positions }, [positions.buffer]);
}

/** One tick per frame while the graph is moving, then a last frame and "settled". */
function loop(): void {
  timer = null;
  if (!sim) return;
  const more = sim.tick();
  postFrame();
  if (more) timer = setTimeout(loop, FRAME_MS);
  else post({ type: 'settled' });
}

function wake(): void {
  if (!sim) return;
  if (reduceMotion) return;
  if (timer === null) timer = setTimeout(loop, FRAME_MS);
}

/** Reduce motion: no animation, only the final positions. */
function settleAndPost(): void {
  if (!sim) return;
  sim.settle();
  postFrame();
  post({ type: 'settled' });
}

self.onmessage = (event: MessageEvent<GraphSimRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'init': {
        const { init } = msg;
        reduceMotion = init.reduceMotion;
        const criteria = init.activeCriteria.filter((c) => HUB_CRITERIA.includes(c));
        const index = buildConnectionIndex(
          init.items,
          init.itemTerms,
          init.terms,
          init.manualConnections,
        );
        const titles = new Map(init.items.map((i) => [i.id, i.title]));
        const layout = computeConstellationLayout(
          init.visibleItemIds,
          criteria,
          index,
          init.terms,
          titles,
          { spacing: init.spacing },
        );
        const spec = buildGraphSpec(
          layout,
          init.visibleItemIds,
          init.manualConnections.map((c) => ({ fromId: c.fromId, toId: c.toId })),
        );
        sim = new GraphSimulation(spec, init.spacing);
        post({
          type: 'graph',
          ids: sim.ids,
          hubs: layout.hubs.map((h) => ({
            key: h.id,
            criterion: h.criterion,
            value: h.value,
            label: h.label,
            itemIds: h.itemIds,
          })),
        });
        postFrame(); // the seed layout, so the canvas can fit its camera at once
        if (reduceMotion) settleAndPost();
        else wake();
        break;
      }
      case 'drag':
        sim?.drag(msg.id, msg.x, msg.y, !reduceMotion);
        wake();
        break;
      case 'release':
        sim?.release(msg.id);
        if (reduceMotion) settleAndPost();
        else wake();
        break;
      case 'spacing':
        sim?.setSpacing(msg.value);
        if (reduceMotion) settleAndPost();
        else wake();
        break;
      case 'stop':
        if (timer !== null) clearTimeout(timer);
        timer = null;
        sim = null;
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
