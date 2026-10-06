import { showTrashToast } from '@/features/trash/trashToast';
import { useMemo, type ReactNode } from 'react';
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
import { Chip, Button, TermCombobox, Thumb } from '@/design/components';
import { FACET_DOT, FACET_NEW_WORD, useTermOptions } from './useTermOptions';
import { isMediaItem } from '@/lib/itemKinds';
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
  const items = useMemo(() => selected.filter((i) => isMediaItem(i)), [selected]);
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
              {isMediaItem(item) && item.status === 'ok' && (
                <Thumb platform={platform} item={item} size={128} />
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
            facet="vibe"
            onAdd={(name) => addTerm('vibe', name)}
            onRemove={removeTerm}
            placeholder={en.details.vibePlaceholder}
          />
          <UnionFacetField
            label={en.vocabulary.facets.movement}
            entries={movementUnion}
            total={items.length}
            facet="movement"
            onAdd={(name) => addTerm('movement', name)}
            onRemove={removeTerm}
            placeholder={en.details.movementPlaceholder}
          />
          <UnionFacetField
            label={en.vocabulary.facets.tag}
            entries={tagUnion}
            total={items.length}
            facet="tag"
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

/** A word field for several selected items: the words only some of them have ("Dreamy 5/8")
 * stay as chips above (click one to give it to all); the field itself holds the words every
 * selected item has and offers the facet's vocabulary (Patch 2 · D2). */
function UnionFacetField({
  label,
  facet,
  entries,
  total,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  facet: 'vibe' | 'movement' | 'tag';
  entries: { term: { id: string; name: string }; count: number }[];
  total: number;
  onAdd: (name: string) => void;
  onRemove: (termId: string) => void;
  placeholder: string;
}) {
  const options = useTermOptions(facet);
  const partial = entries.filter((e) => e.count < total);
  const common = entries.filter((e) => e.count >= total);
  return (
    <Field label={label}>
      {partial.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {partial.map(({ term, count }) => (
            <Chip key={term.id} onClick={() => onAdd(term.name)} onRemove={() => onRemove(term.id)}>
              {term.name} {count}/{total}
            </Chip>
          ))}
        </div>
      )}
      <TermCombobox
        label={label}
        values={common.map((e) => e.term.name)}
        options={options}
        onAdd={onAdd}
        onRemove={(name) => {
          const entry = common.find((e) => e.term.name === name);
          if (entry) onRemove(entry.term.id);
        }}
        placeholder={placeholder}
        dotColor={FACET_DOT[facet]}
        newWordLabel={FACET_NEW_WORD[facet]}
      />
    </Field>
  );
}
