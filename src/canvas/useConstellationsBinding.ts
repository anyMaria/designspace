import { useEffect, useMemo, useRef } from 'react';
import type { Engine } from './Engine';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { useSearchResults } from '@/features/search/useSearchResults';
import {
  defaultLayoutWorkerFactory,
  runConstellationLayout,
} from '@/workers/runConstellationLayout';
import type { WorkerLike } from '@/workers/ingestQueue';
import { prefersReducedMotion } from '@/lib/motion';
import { logger } from '@/lib/logger';

/** §2.10/§4.9 Constellations: Shift+C or the popover's ✦ switch (both just flip
 * `connectionsUiStore.constellationsOn`) — this hook is what actually runs the layout worker and
 * drives the engine. Turning it on (or changing anything the layout depends on while it's
 * already on — "changing an item's values re-settles it smoothly") computes a fresh layout in
 * `workers/layout.worker.ts` and hands it to `Engine.enterConstellations`, which owns the 800ms
 * morph; turning it off calls `Engine.exitConstellations` ("Back to my layout"). Respects the
 * active search filter the same way Show all does — only matching, non-deleted items are laid
 * out. A stale in-flight worker response (superseded by a newer request before it resolves) is
 * dropped via `requestId`, and the worker itself is created fresh per run and terminated after,
 * per `runConstellationLayout`'s own doc comment. */
export function useConstellationsBinding(engine: Engine | null): void {
  const items = useLibraryStore((s) => s.items);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const constellationsOn = useConnectionsUiStore((s) => s.constellationsOn);
  const { matches } = useSearchResults();

  // `items` gets a fresh Map reference for *any* field write — including ingest quietly filling
  // in a thumbnail/palette/phash/width/height well after import, which can take several seconds
  // across 60+ items. `buildConnectionIndex`/`computeHubs` only ever read `deletedAt` off an
  // item unconditionally, plus `colorFamilies` when `color` is an active criterion (and `title`,
  // for hub labels, which never changes on its own). Keying the re-settle on a signature of just
  // those fields — instead of `items` itself, and only including `colorFamilies` when it's
  // actually relevant to the active criteria — means an in-progress ingest run doesn't
  // repeatedly cancel and restart the 800ms morph before it ever gets to finish; it only
  // re-triggers for a change that could actually move something.
  const includeColor = activeCriteria.includes('color');
  const itemsSignature = useMemo(
    () =>
      [...items.values()]
        .map(
          (i) =>
            `${i.id}:${i.deletedAt ?? ''}:${includeColor ? (i.colorFamilies ?? []).join(',') : ''}:${i.title}`,
        )
        .join('|'),
    [items, includeColor],
  );

  const requestId = useRef(0);
  const workerRef = useRef<WorkerLike | null>(null);

  useEffect(() => {
    if (!engine) return;

    if (!constellationsOn) {
      workerRef.current?.terminate();
      workerRef.current = null;
      useConnectionsUiStore.getState().setArranging(false);
      engine.exitConstellations(prefersReducedMotion());
      return;
    }

    const myRequestId = ++requestId.current;
    const visibleItemIds: string[] = [];
    for (const item of items.values()) {
      if (item.deletedAt) continue;
      if (matches && !matches.has(item.id)) continue;
      visibleItemIds.push(item.id);
    }

    useConnectionsUiStore.getState().setArranging(true);
    const worker = defaultLayoutWorkerFactory();
    workerRef.current = worker;

    runConstellationLayout(worker, {
      visibleItemIds,
      activeCriteria,
      items: [...items.values()],
      itemTerms,
      terms,
      manualConnections: [...connections.values()],
    })
      .then((layout) => {
        if (requestId.current !== myRequestId) return; // superseded by a newer run
        engine.enterConstellations(
          layout.itemPositions,
          layout.hubs,
          layout.unclassifiedIds,
          prefersReducedMotion(),
        );
      })
      .catch((err: unknown) => {
        logger.error('Constellations layout failed', err);
      })
      .finally(() => {
        if (requestId.current === myRequestId) useConnectionsUiStore.getState().setArranging(false);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      });
    // `items`/`itemTerms`/`terms`/`connections` are read fresh above every run; only
    // `itemsSignature` (not `items` itself) gates re-runs, for the reason in the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engine,
    constellationsOn,
    itemsSignature,
    itemTerms,
    terms,
    connections,
    activeCriteria,
    matches,
  ]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );
}
