import { thumbUrl } from '@/lib/thumbs';
import { useMemo } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useSuggestionsUiStore } from '@/state/suggestionsUiStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import { useHistoryStore } from '@/commands/history';
import { createDismissSuggestionCommand } from '@/commands/boardCommands';
import { buildSearchIndex, search as runSearch, type Filter } from '@/lib/search';
import { isFilterActive } from '@/state/searchStore';
import { boardSimilarSuggestions } from '@/lib/ai/boardSimilarSuggestions';
import { LIST_ITEM_DRAG_MIME } from '@/features/list/useListDragToBoard';
import { Panel } from '@/design/components';
import { en } from '@/i18n/en';

// "aren't on the board yet" (§2.11) caps how many the tray shows at once — a board with a broad
// source filter could otherwise match hundreds of library items.
const SUGGESTIONS_LIMIT = 12;

/** "More like this" (§2.11): a collapsible strip above the dock, shown only while viewing a board
 * that was created from a search (so it has a real `sourceFilter` to re-run) with unadded matches
 * left. Re-runs the board's saved filter against the *whole* library — `board.sourceFilter` is a
 * `lib/search.ts` `Filter`, the exact shape the search bar itself produces — via the same
 * `buildSearchIndex`/`search` pair `useSearchResults` uses, filtering out whatever's already on
 * this board (`libraryStore.placements`, scoped to the current space, which is this board while
 * it's open) and whatever the owner already dismissed (`board.settings.dismissedSuggestions`).
 * Drag a tile onto the canvas to add it — reuses `useListDragToBoard`'s drop handler via the same
 * `LIST_ITEM_DRAG_MIME`, mounted once in `Shell.tsx`. When the source-filter matches don't fill
 * the tray (or there's no source filter at all — an empty/manually-built board), the remaining
 * slots are filled with `boardSimilarSuggestions` (§4.10): the centroid of the board's own placed
 * items, compared against the rest of the library. */
export function SuggestionsTray({ platform }: { platform: Platform }) {
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const boards = useBoardStore((s) => s.boards);
  const board = currentBoardId ? boards.get(currentBoardId) : null;
  const items = useLibraryStore((s) => s.items);
  const placements = useLibraryStore((s) => s.placements);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const collapsed = useSuggestionsUiStore((s) => s.collapsed);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const embeddings = useEmbeddingsStore((s) => s.vectors);

  const isBoard = board?.kind === 'board';
  const sourceFilter = (board?.sourceFilter as Filter | undefined) ?? null;
  const dismissed = useMemo(
    () => new Set((board?.settings?.dismissedSuggestions as string[] | undefined) ?? []),
    [board?.settings],
  );

  const suggestions = useMemo(() => {
    if (!isBoard) return [];
    const out: string[] = [];
    const seen = new Set<string>();

    if (sourceFilter && isFilterActive(sourceFilter)) {
      const index = buildSearchIndex(items.values(), itemTerms, terms);
      const matches = runSearch(items.values(), itemTerms, index, sourceFilter);
      for (const id of matches) {
        if (placements.has(id) || dismissed.has(id)) continue;
        out.push(id);
        seen.add(id);
        if (out.length >= SUGGESTIONS_LIMIT) break;
      }
    }

    if (aiEnabled && out.length < SUGGESTIONS_LIMIT) {
      const exclude = new Set([...placements.keys(), ...dismissed, ...seen]);
      const remaining = SUGGESTIONS_LIMIT - out.length;
      const similar = boardSimilarSuggestions(placements.keys(), embeddings, exclude, remaining);
      out.push(...similar);
    }

    return out;
  }, [
    isBoard,
    sourceFilter,
    items,
    itemTerms,
    terms,
    placements,
    dismissed,
    aiEnabled,
    embeddings,
  ]);

  if (!currentBoardId || suggestions.length === 0) return null;

  function dismiss(itemId: string): void {
    void useHistoryStore
      .getState()
      .execute(createDismissSuggestionCommand(platform, currentBoardId!, itemId));
  }

  return (
    <Panel
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        maxWidth: 'min(90vw, 640px)',
      }}
    >
      <button
        type="button"
        onClick={() => useSuggestionsUiStore.getState().toggle()}
        aria-expanded={!collapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
          padding: 0,
        }}
      >
        {collapsed ? (
          <ChevronUp size={14} strokeWidth={1.75} />
        ) : (
          <ChevronDown size={14} strokeWidth={1.75} />
        )}
        <span>{en.suggestions.title}</span>
        <span style={{ color: 'var(--text-3)' }}>{suggestions.length}</span>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
          {suggestions.map((id) => (
            <SuggestionTile key={id} id={id} platform={platform} onDismiss={() => dismiss(id)} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function SuggestionTile({
  id,
  platform,
  onDismiss,
}: {
  id: string;
  platform: Platform;
  onDismiss: () => void;
}) {
  const item = useLibraryStore((s) => s.items.get(id));
  if (!item) return null;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData(LIST_ITEM_DRAG_MIME, id)}
        title={item.title}
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'var(--surface-2)',
          cursor: 'grab',
        }}
      >
        {item.status === 'ok' && (
          <img
            src={thumbUrl(
              platform,
              { id, thumbV: useLibraryStore.getState().items.get(id)?.thumbV },
              128,
            )}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <button
        type="button"
        aria-label={en.suggestions.dismiss}
        title={en.suggestions.dismiss}
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: -4,
          right: -4,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--surface-3)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-1)',
        }}
      >
        <X size={10} strokeWidth={2} />
      </button>
    </div>
  );
}
