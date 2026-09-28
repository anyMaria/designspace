import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { useTermStore } from '@/state/termStore';
import { Button, Chip, IconButton } from '@/design/components';
import { X } from 'lucide-react';
import { en } from '@/i18n/en';
import { useSuggestions } from './useSuggestions';

/** Details panel's suggestions (§4.10, §2.6): zero-shot + personal blend across every facet,
 * accept (adds the term through the normal undoable command) or dismiss (never suggested again
 * for this item — `ai_dismissed`, not undoable, see `dismissed.ts`). Renders nothing when AI is
 * off, still analyzing this item, or has nothing to suggest. Triage's ghost chips (§2.7) share
 * the same `useSuggestions` hook. */
export function SuggestionsSection({ platform, item }: { platform: Platform; item: Item }) {
  const terms = useTermStore((s) => s.terms);
  const { suggestions, accept, dismiss, acceptAll } = useSuggestions(platform, item.id);

  if (suggestions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
          {en.aiSuggestions.title}
        </span>
        {suggestions.length > 1 && (
          <Button variant="ghost" onClick={acceptAll}>
            {en.aiSuggestions.acceptAll}
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {suggestions.map(({ facet, termId }) => {
          const term = terms.get(termId);
          if (!term) return null;
          return (
            <span key={termId} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Chip variant="suggestion" onClick={() => accept(facet, termId)}>
                {term.name}
              </Chip>
              <IconButton
                icon={<X size={12} strokeWidth={2} />}
                label={en.aiSuggestions.dismiss}
                onClick={() => dismiss(termId)}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
