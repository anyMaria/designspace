import type { Criterion } from '@/lib/connections';
import type { Item, ManualConnection, Term } from '@/state/types';

/** Messages between the Overview and `graphSim.worker.ts` (Patch 3 · D1). */

export interface GraphInit {
  visibleItemIds: string[];
  activeCriteria: Criterion[];
  items: Item[];
  itemTerms: Map<string, Set<string>>;
  terms: Map<string, Term>;
  manualConnections: ManualConnection[];
  spacing: number;
  /** Reduce motion: run to the end and post once. */
  reduceMotion: boolean;
}

export type GraphSimRequest =
  | { type: 'init'; init: GraphInit }
  | { type: 'drag'; id: string; x: number; y: number }
  | { type: 'release'; id: string }
  | { type: 'spacing'; value: number }
  | { type: 'stop' };

/** What the canvas needs to know about a star; positions arrive separately, as frames. */
export interface GraphHub {
  /** Stable across runs: `criterion:value`. */
  key: string;
  criterion: Criterion;
  value: string;
  label: string;
  itemIds: string[];
}

export type GraphSimResponse =
  /** Once, right after `init`: the nodes (in the order frames use) and the stars. */
  | { type: 'graph'; ids: string[]; hubs: GraphHub[] }
  /** `[x0, y0, x1, y1, …]` in the order of the `graph` message's `ids` (transferred). */
  | { type: 'frame'; positions: Float32Array }
  | { type: 'settled' }
  | { type: 'error'; message: string };
