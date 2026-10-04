import { showTrashToast } from '@/features/trash/trashToast';
import { thumbUrl } from '@/lib/thumbs';
import { useMemo, useState, type ReactNode } from 'react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { useTermStore } from '@/state/termStore';
import { useHistoryStore } from '@/commands/history';
import { createBulkSetItemFieldCommand, createTrashCommand } from '@/commands/itemCommands';
import {
  createBulkAddTermCommand,
  createBulkRemoveTermCommand,
  createBulkSetTypeCommand,
} from '@/commands/itemTermCommands';
import { Chip, Button } from '@/design/components';
import { isMediaKind } from '@/lib/itemKinds';
import { en } from '@/i18n/en';

/** Details panel for several selected items — §2.6 "Several items selected". Single-item editing
 * lives in `DetailsPanel.tsx`; the two share the vocabulary chip styling but not much logic, since
 * "mixed" state and union-with-counts don't apply to a single item. */
export function BulkDetailsPanel({
  platform,
  items: selected,
}: {
  platform: Platform;
  items: Item[];
}) {
  const terms = useTermStore((s) => s.terms);
  const allItemTerms = useTermStore((s) => s.itemTerms);
  const allIds = useMemo(() => selected.map((i) => i.id), [selected]);
  // Classification (Type, Vibe, Movement, Tags, Artist) only applies to collected media; notes and
  // palettes are left out (Patch 1 · D3).
  const items = useMemo(() => selected.filter((i) => isMediaKind(i.kind)), [selected]);
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const noteCount = selected.filter((i) => i.kind === 'note').length;
  const paletteCount = selected.filter((i) => i.kind === 'swatch').length;

  const typeTerms = useMemo(
    () => [...terms.values()].filter((t) => t.facet === 'type').sort((a, b) => a.sort - b.sort),
    [terms],
  );

  const unionsByFacet = useMemo(() => {
    const counts = new Map<'vibe' | 'movement' | 'tag', Map<string, number>>([
      ['vibe', new Map()],
      ['movement', new Map()],
      ['tag', new Map()],
    ]);
    for (const id of itemIds) {
      const ids = allItemTerms.get(id);
      if (!ids) continue;
      for (const termId of ids) {
        const term = terms.get(termId);
        if (term?.facet === 'vibe' || term?.facet === 'movement' || term?.facet === 'tag') {
          const facetCounts = counts.get(term.facet)!;
          facetCounts.set(termId, (facetCounts.get(termId) ?? 0) + 1);
        }
      }
    }
    const toEntries = (facetCounts: Map<string, number>) =>
      [...facetCounts.entries()]
        .map(([termId, count]) => ({ term: terms.get(termId)!, count }))
        .sort((a, b) => b.count - a.count);
    return {
      vibe: toEntries(counts.get('vibe')!),
      movement: toEntries(counts.get('movement')!),
      tag: toEntries(counts.get('tag')!),
    };
  }, [itemIds, allItemTerms, terms]);
  const { vibe: vibeUnion, movement: movementUnion, tag: tagUnion } = unionsByFacet;

  const typeIdsPerItem = itemIds.map(
    (id) =>
      [...(allItemTerms.get(id) ?? [])].find((tid) => terms.get(tid)?.facet === 'type') ?? null,
  );
  const commonTypeId =
    typeIdsPerItem.length > 0 && typeIdsPerItem.every((id) => id === typeIdsPerItem[0])
      ? typeIdsPerItem[0]
      : null;

  const artists = new Set(items.map((i) => i.artist ?? ''));
  const artistMixed = artists.size > 1;
  const allFavorite = selected.every((i) => i.favorite);

  const [draftVibe, setDraftVibe] = useState('');
  const [draftMovement, setDraftMovement] = useState('');
  const [draftTag, setDraftTag] = useState('');

  function setType(termRef: { id: string } | { name: string }): void {
    void useHistoryStore.getState().execute(createBulkSetTypeCommand(platform, itemIds, termRef));
  }

  function addTerm(facet: 'vibe' | 'movement' | 'tag', name: string): void {
    if (!name.trim()) return;
    const existing = [...terms.values()].find(
      (t) => t.facet === facet && t.name.toLowerCase() === name.trim().toLowerCase(),
    );
    void useHistoryStore
      .getState()
      .execute(
        createBulkAddTermCommand(
          platform,
          itemIds,
          facet,
          existing ? { id: existing.id } : { name: name.trim() },
        ),
      );
  }

  function removeTerm(termId: string): void {
    void useHistoryStore.getState().execute(createBulkRemoveTermCommand(platform, itemIds, termId));
  }

  function setArtist(value: string): void {
    void useHistoryStore
      .getState()
      .execute(createBulkSetItemFieldCommand(platform, itemIds, 'artist', value || null));
  }

  function toggleFavorite(): void {
    void useHistoryStore
      .getState()
      .execute(createBulkSetItemFieldCommand(platform, allIds, 'favorite', !allFavorite));
  }

  function moveToTrash(): void {
    void useHistoryStore
      .getState()
      .execute(createTrashCommand(platform, allIds))
      .then(() => {
        showTrashToast(allIds.length, () => void useHistoryStore.getState().undo());
      });
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex' }}>
          {selected.slice(0, 4).map((item, i) => (
            <div
              key={item.id}
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                background: 'var(--surface-2)',
                marginLeft: i > 0 ? -12 : 0,
                border: '2px solid var(--surface-1)',
                flexShrink: 0,
              }}
            >
              {isMediaKind(item.kind) && item.status === 'ok' && (
                <img
                  src={thumbUrl(platform, item, 128)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
          ))}
        </div>
        <span className="font-display">{en.details.itemsSelected(selected.length)}</span>
      </div>

      {noteCount + paletteCount > 0 && (
        <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
          {en.notes.notClassified(noteCount, paletteCount)}
        </span>
      )}

      {items.length > 0 && (
        <>
          <Field label={en.vocabulary.facets.type}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-1)',
                alignItems: 'center',
              }}
            >
              {typeTerms.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="ds-chip"
                  style={
                    t.id === commonTypeId
                      ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                      : undefined
                  }
                  onClick={() => setType({ id: t.id })}
                >
                  {t.name}
                </button>
              ))}
              {!commonTypeId && <span style={{ color: 'var(--text-3)' }}>{en.details.mixed}</span>}
            </div>
          </Field>

          <UnionFacetField
            label={en.vocabulary.facets.vibe}
            entries={vibeUnion}
            total={items.length}
            draft={draftVibe}
            onDraftChange={setDraftVibe}
            onAdd={(name) => addTerm('vibe', name)}
            onRemove={removeTerm}
            placeholder={en.details.vibePlaceholder}
          />
          <UnionFacetField
            label={en.vocabulary.facets.movement}
            entries={movementUnion}
            total={items.length}
            draft={draftMovement}
            onDraftChange={setDraftMovement}
            onAdd={(name) => addTerm('movement', name)}
            onRemove={removeTerm}
            placeholder={en.details.movementPlaceholder}
          />
          <UnionFacetField
            label={en.vocabulary.facets.tag}
            entries={tagUnion}
            total={items.length}
            draft={draftTag}
            onDraftChange={setDraftTag}
            onAdd={(name) => addTerm('tag', name)}
            onRemove={removeTerm}
            placeholder={en.details.tagsPlaceholder}
          />

          <Field label={en.details.artist}>
            <input
              aria-label={en.details.artist}
              key={artistMixed ? 'mixed' : (items[0]?.artist ?? '')}
              className="ds-chip-input__field"
              defaultValue={artistMixed ? '' : (items[0]?.artist ?? '')}
              placeholder={
                artistMixed ? en.details.artistMixedPlaceholder : en.details.artistPlaceholder
              }
              onBlur={(e) => setArtist(e.target.value)}
            />
          </Field>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{en.details.favorite}</span>
        <button
          type="button"
          role="switch"
          aria-checked={allFavorite}
          aria-label={en.details.favorite}
          className="ds-toggle"
          onClick={toggleFavorite}
        >
          <span className="ds-toggle__thumb" />
        </button>
      </div>

      <Button variant="ghost" onClick={moveToTrash}>
        {en.contextMenu.moveToTrash}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>{label}</span>
      {children}
    </div>
  );
}

function UnionFacetField({
  label,
  entries,
  total,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  entries: { term: { id: string; name: string }; count: number }[];
  total: number;
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: (name: string) => void;
  onRemove: (termId: string) => void;
  placeholder: string;
}) {
  function commit(): void {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    onDraftChange('');
  }

  return (
    <Field label={label}>
      <div className="ds-chip-input">
        {entries.map(({ term, count }) => (
          <Chip key={term.id} onClick={() => onAdd(term.name)} onRemove={() => onRemove(term.id)}>
            {term.name} {count}/{total}
          </Chip>
        ))}
        <input
          className="ds-chip-input__field"
          value={draft}
          placeholder={entries.length === 0 ? placeholder : undefined}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
    </Field>
  );
}
