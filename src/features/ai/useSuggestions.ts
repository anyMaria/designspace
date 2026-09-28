import { useEffect, useState } from 'react';
import type { Platform } from '@/platform/types';
import type { Facet } from '@/state/types';
import { useHistoryStore } from '@/commands/history';
import { createAddItemTermCommand, createSetItemTypeCommand } from '@/commands/itemTermCommands';
import { useSettingsStore } from '@/state/settingsStore';
import { computeSuggestions, type FacetSuggestions } from './computeSuggestions';
import { dismissSuggestion } from './dismissed';

export interface SuggestedTerm {
  facet: Facet;
  termId: string;
}

export interface UseSuggestionsResult {
  suggestions: SuggestedTerm[];
  accept: (facet: Facet, termId: string) => void;
  dismiss: (termId: string) => void;
  acceptAll: () => void;
}

/** Shared by the Details panel's suggestions section and Triage's ghost chips (§4.10, §2.6,
 * §2.7) — one computation, one accept/dismiss/accept-all implementation, so Triage's `A` key and
 * Details' "Accept all" button behave identically. */
export function useSuggestions(platform: Platform, itemId: string | null): UseSuggestionsResult {
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const [byFacet, setByFacet] = useState<FacetSuggestions[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      const results = aiEnabled && itemId ? await computeSuggestions(platform, itemId) : [];
      if (!cancelled) setByFacet(results);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [aiEnabled, platform, itemId]);

  const suggestions = byFacet.flatMap((f) =>
    f.suggestions.map((s) => ({ facet: f.facet, termId: s.termId })),
  );

  function remove(termId: string): void {
    setByFacet((prev) =>
      prev.map((f) => ({ ...f, suggestions: f.suggestions.filter((s) => s.termId !== termId) })),
    );
  }

  function accept(facet: Facet, termId: string): void {
    if (!itemId) return;
    const command =
      facet === 'type'
        ? createSetItemTypeCommand(platform, itemId, { id: termId })
        : createAddItemTermCommand(platform, itemId, facet, { id: termId });
    void useHistoryStore.getState().execute(command);
    remove(termId);
  }

  function dismiss(termId: string): void {
    if (!itemId) return;
    void dismissSuggestion(platform, itemId, termId);
    remove(termId);
  }

  function acceptAll(): void {
    for (const { facet, termId } of suggestions) accept(facet, termId);
  }

  return { suggestions, accept, dismiss, acceptAll };
}
