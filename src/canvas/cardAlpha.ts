import { canvasGeometry } from '@/design/tokens';

export interface AlphaInputs {
  hoverHighlight: ReadonlySet<string> | null;
  searchMatches: ReadonlySet<string> | null;
  searchMode: 'dim' | 'hide';
  suppressConnectionDim: boolean;
}

/** The ids to keep bright while connections show, or null when no source has a single candidate:
 * then nothing should dim at all (selecting an unclassified item must not fade the whole map). */
export function connectionRelatedSet(
  sources: readonly { fromId: string; candidates: readonly { id: string }[] }[],
): Set<string> | null {
  if (!sources.some((s) => s.candidates.length > 0)) return null;
  const related = new Set<string>();
  for (const { fromId, candidates } of sources) {
    related.add(fromId);
    for (const c of candidates) related.add(c.id);
  }
  return related;
}

export function cardAlpha(id: string, inputs: AlphaInputs, related: Set<string> | null): number {
  if (inputs.hoverHighlight) return inputs.hoverHighlight.has(id) ? 1 : canvasGeometry.dimSearch;
  if (related && !inputs.suppressConnectionDim)
    return related.has(id) ? 1 : canvasGeometry.dimConnections;
  const isMatch = !inputs.searchMatches || inputs.searchMatches.has(id);
  return isMatch || inputs.searchMode === 'hide' ? 1 : canvasGeometry.dimSearch;
}
