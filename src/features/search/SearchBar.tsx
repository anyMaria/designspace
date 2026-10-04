import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Frame, SlidersHorizontal, Star, X } from 'lucide-react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useSearchStore, isFilterActive } from '@/state/searchStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useHistoryStore } from '@/commands/history';
import { createBoardFromItemsCommand } from '@/commands/boardCommands';
import { switchSpace } from '@/features/boards/switchSpace';
import { useToastStore } from '@/state/toastStore';
import type { ColorFamily } from '@/lib/color';
import type { Facet, ItemKind } from '@/state/types';
import { useSearchResults } from './useSearchResults';
import { Panel, SearchField, Chip, IconButton, Button, Tabs, Toggle } from '@/design/components';
import { en } from '@/i18n/en';
import { useEscape } from '@/app/useEscape';

const KINDS: ItemKind[] = ['image', 'video', 'pdf', 'font', 'link', 'note', 'swatch'];
const COLORS: ColorFamily[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'brown',
  'black',
  'grey',
  'white',
];
const FACETS: Facet[] = ['type', 'vibe', 'movement', 'tag'];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function isoStartOfYear(): string {
  return new Date(new Date().getFullYear(), 0, 1).toISOString();
}

/** Floating top-center search bar (§2.8) — free text plus the Filters menu, with the active
 * filter chips (included and struck-through excluded) always visible underneath. Board filtering
 * and saved filters are deferred (see docs/DECISIONS.md): Boards don't exist before M3, and saved
 * filters are meant to also surface at the top of the List panel, which lands in M2-8. */
export function SearchBar({ engine, platform }: { engine: Engine | null; platform: Platform }) {
  const isOpen = useSearchStore((s) => s.isOpen);
  const filter = useSearchStore((s) => s.filter);
  const dimHideMode = useSearchStore((s) => s.dimHideMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useTermStore((s) => s.terms);
  const items = useLibraryStore((s) => s.items);
  const { matches, total } = useSearchResults(platform);
  const includeVisualMatches = useSearchStore((s) => s.includeVisualMatches);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);

  const artists = [
    ...new Set([...items.values()].map((i) => i.artist).filter((a): a is string => !!a)),
  ].sort();

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEscape(isOpen, () => useSearchStore.getState().closeOrClearText(), {
    allowWhileTyping: true,
  });

  if (!isOpen) return null;

  const active = isFilterActive(filter);
  const matchedCount = matches ? matches.size : total;

  function frameResults(): void {
    if (matches) engine?.zoomToIds([...matches]);
  }

  function createBoardFromResults(): void {
    if (!matches) return;
    const { command, board } = createBoardFromItemsCommand(
      platform,
      [...matches],
      en.boards.untitled,
      filter,
    );
    void useHistoryStore
      .getState()
      .execute(command)
      .then(() => switchSpace(platform, board.id))
      .then(() => {
        useToastStore.getState().show(en.boards.createdBoard(board.name));
      });
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 'var(--space-4)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)',
        width: 'min(640px, 90vw)',
      }}
    >
      <Panel
        style={{
          width: '100%',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <SearchField
            ref={inputRef}
            style={{ flex: 1 }}
            value={filter.text ?? ''}
            placeholder={en.search.placeholder}
            onChange={(e) => useSearchStore.getState().setText(e.target.value)}
          />
          <IconButton
            icon={<SlidersHorizontal size={18} strokeWidth={1.75} />}
            label={en.search.filters}
            active={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          />
          <IconButton
            icon={<X size={18} strokeWidth={1.75} />}
            label={en.search.close}
            onClick={() => useSearchStore.getState().closeOrClearText()}
          />
        </div>

        {aiEnabled && filter.text && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
              {en.search.includeVisualMatches}
            </span>
            <Toggle
              checked={includeVisualMatches}
              onChange={() => useSearchStore.getState().toggleIncludeVisualMatches()}
              label={en.search.includeVisualMatches}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)', minWidth: '14ch' }}>
            {en.search.count(matchedCount, total)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="ds-chip"
              aria-pressed={!!filter.favorite}
              style={
                filter.favorite
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : undefined
              }
              onClick={() => useSearchStore.getState().toggleFavorite()}
            >
              <Star size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
              {en.search.favoritesToggle}
            </button>
            {active && (
              <>
                <Button variant="ghost" onClick={frameResults}>
                  <Frame size={14} strokeWidth={1.75} style={{ marginRight: 4 }} />
                  {en.search.frameResults}
                </Button>
                <Button
                  variant="ghost"
                  disabled={matchedCount === 0}
                  onClick={createBoardFromResults}
                >
                  {en.boards.createFromResults}
                </Button>
                <Tabs
                  aria-label="Dim or hide"
                  tabs={[
                    { id: 'dim', label: en.search.dim },
                    { id: 'hide', label: en.search.hide },
                  ]}
                  value={dimHideMode}
                  onChange={(v) => useSearchStore.getState().setDimHideMode(v)}
                />
                <Button variant="ghost" onClick={() => useSearchStore.getState().clearFilter()}>
                  {en.search.clearAll}
                </Button>
              </>
            )}
          </div>
        </div>

        {active && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {FACETS.flatMap((facet) => [
              ...(filter.include?.[facet] ?? []).map((id) => {
                const term = terms.get(id);
                return term ? (
                  <Chip
                    key={`inc-${id}`}
                    dotColor={`var(--criterion-${facet})`}
                    onRemove={() => useSearchStore.getState().toggleTerm(facet, id, false)}
                  >
                    {term.name}
                  </Chip>
                ) : null;
              }),
              ...(filter.exclude?.[facet] ?? []).map((id) => {
                const term = terms.get(id);
                return term ? (
                  <Chip
                    key={`exc-${id}`}
                    variant="excluded"
                    onRemove={() => useSearchStore.getState().toggleTerm(facet, id, true)}
                  >
                    {term.name}
                  </Chip>
                ) : null;
              }),
            ])}
            {filter.kinds?.map((k) => (
              <Chip key={`kind-${k}`} onRemove={() => useSearchStore.getState().toggleKind(k)}>
                {en.search.kind}: {en.kind[k]}
              </Chip>
            ))}
            {filter.colors?.map((c) => (
              <Chip key={`color-${c}`} onRemove={() => useSearchStore.getState().toggleColor(c)}>
                {c}
              </Chip>
            ))}
            {filter.artists?.map((a) => (
              <Chip key={`artist-${a}`} onRemove={() => useSearchStore.getState().toggleArtist(a)}>
                {a}
              </Chip>
            ))}
            {filter.favorite && (
              <Chip onRemove={() => useSearchStore.getState().toggleFavorite()}>
                {en.search.favorite}
              </Chip>
            )}
            {filter.inbox && (
              <Chip onRemove={() => useSearchStore.getState().toggleInbox()}>
                {en.search.inbox}
              </Chip>
            )}
            {filter.added && (
              <Chip onRemove={() => useSearchStore.getState().setDateRange(undefined)}>
                {en.search.dateAdded}
              </Chip>
            )}
          </div>
        )}

        {filtersOpen && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              paddingTop: 'var(--space-2)',
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            {FACETS.map((facet) => {
              const facetTerms = [...terms.values()].filter((t) => t.facet === facet);
              if (facetTerms.length === 0) return null;
              return (
                <FilterSection key={facet} label={en.vocabulary.facets[facet]}>
                  {facetTerms.map((t) => {
                    const included = filter.include?.[facet]?.includes(t.id) ?? false;
                    const excluded = filter.exclude?.[facet]?.includes(t.id) ?? false;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="ds-chip"
                        style={
                          included
                            ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                            : excluded
                              ? { textDecoration: 'line-through', opacity: 0.6 }
                              : undefined
                        }
                        onClick={(e) => useSearchStore.getState().toggleTerm(facet, t.id, e.altKey)}
                        title="Alt+click to exclude"
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </FilterSection>
              );
            })}

            <FilterSection label={en.search.kind}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="ds-chip"
                  style={
                    filter.kinds?.includes(k)
                      ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                      : undefined
                  }
                  onClick={() => useSearchStore.getState().toggleKind(k)}
                >
                  {en.kind[k]}
                </button>
              ))}
            </FilterSection>

            <FilterSection label={en.search.colors}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => useSearchStore.getState().toggleColor(c)}
                  aria-label={c}
                  title={c}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 'var(--radius-pill)',
                    background: `var(--family-${c})`,
                    border: filter.colors?.includes(c)
                      ? '2px solid var(--accent)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </FilterSection>

            {artists.length > 0 && (
              <FilterSection label={en.search.artists}>
                {artists.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="ds-chip"
                    style={
                      filter.artists?.includes(a)
                        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                        : undefined
                    }
                    onClick={() => useSearchStore.getState().toggleArtist(a)}
                  >
                    {a}
                  </button>
                ))}
              </FilterSection>
            )}

            <FilterSection label="">
              <button
                type="button"
                className="ds-chip"
                style={
                  filter.favorite
                    ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                    : undefined
                }
                onClick={() => useSearchStore.getState().toggleFavorite()}
              >
                {en.search.favorite}
              </button>
              <button
                type="button"
                className="ds-chip"
                style={
                  filter.inbox
                    ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                    : undefined
                }
                onClick={() => useSearchStore.getState().toggleInbox()}
              >
                {en.search.inbox}
              </button>
            </FilterSection>

            <FilterSection label={en.search.dateAdded}>
              <button
                type="button"
                className="ds-chip"
                onClick={() => useSearchStore.getState().setDateRange({ from: isoDaysAgo(0) })}
              >
                {en.search.dateToday}
              </button>
              <button
                type="button"
                className="ds-chip"
                onClick={() => useSearchStore.getState().setDateRange({ from: isoDaysAgo(7) })}
              >
                {en.search.date7d}
              </button>
              <button
                type="button"
                className="ds-chip"
                onClick={() => useSearchStore.getState().setDateRange({ from: isoDaysAgo(30) })}
              >
                {en.search.date30d}
              </button>
              <button
                type="button"
                className="ds-chip"
                onClick={() => useSearchStore.getState().setDateRange({ from: isoStartOfYear() })}
              >
                {en.search.dateYear}
              </button>
            </FilterSection>
          </div>
        )}
      </Panel>
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>{label}</span>}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', alignItems: 'center' }}
      >
        {children}
      </div>
    </div>
  );
}
