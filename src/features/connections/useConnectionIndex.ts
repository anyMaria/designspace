import { useMemo } from 'react';
import { buildConnectionIndex, type ConnectionIndex } from '@/lib/connections';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';

/** The connection index for UI that explains connections (popover, hover pill). Only built while
 * `enabled`, so closed UI costs nothing. */
export function useConnectionIndex(enabled: boolean): ConnectionIndex | null {
  const items = useLibraryStore((s) => s.items);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const connections = useManualConnectionsStore((s) => s.connections);
  const embeddings = useEmbeddingsStore((s) => s.vectors);
  return useMemo(
    () =>
      enabled
        ? buildConnectionIndex(items.values(), itemTerms, terms, connections.values(), embeddings)
        : null,
    [enabled, items, itemTerms, terms, connections, embeddings],
  );
}
