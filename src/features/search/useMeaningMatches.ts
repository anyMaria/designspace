import { useEffect, useState } from 'react';
import type { Platform } from '@/platform/types';
import { useSearchStore } from '@/state/searchStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import { getAiQueue } from '@/workers/aiQueue';
import { searchByMeaning } from '@/lib/ai/searchByMeaning';

const DEBOUNCE_MS = 300;

/** §4.10/§2.10's "Include visual matches": embeds the search bar's text query and returns the
 * item ids `searchByMeaning` matches, debounced so every keystroke doesn't trigger its own
 * `embedText` round trip. `null` whenever the toggle is off, there's no query text, or AI can't
 * run — callers union this into the regular text/facet match set. */
export function useMeaningMatches(platform: Platform): Set<string> | null {
  const text = useSearchStore((s) => s.filter.text);
  const includeVisualMatches = useSearchStore((s) => s.includeVisualMatches);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const embeddings = useEmbeddingsStore((s) => s.vectors);
  const [matches, setMatches] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!includeVisualMatches || !aiEnabled || !text) {
        setMatches(null);
        return;
      }
      const queue = getAiQueue(platform);
      if (!queue) {
        setMatches(null);
        return;
      }
      queue
        .embedText(text)
        .then((vector) => {
          if (cancelled) return;
          setMatches(new Set(searchByMeaning(vector, embeddings)));
        })
        .catch(() => {
          if (!cancelled) setMatches(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [platform, text, includeVisualMatches, aiEnabled, embeddings]);

  return matches;
}
