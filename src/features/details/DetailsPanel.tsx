import { useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Sparkles, X } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import type { Engine } from '@/canvas/Engine';
import { useTermStore } from '@/state/termStore';
import { useFocusStore } from '@/state/focusStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useEmbeddingsStore } from '@/state/embeddingsStore';
import { useHistoryStore } from '@/commands/history';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import {
  createAddItemTermCommand,
  createRemoveItemTermCommand,
  createSetItemTypeCommand,
} from '@/commands/itemTermCommands';
import { createRemoveConnectionCommand } from '@/commands/connectionCommands';
import { ChipInput, Swatch, Toggle, Button, IconButton } from '@/design/components';
import { formatBytes } from '@/lib/formatBytes';
import { formatDuration } from '@/lib/formatDuration';
import { findSimilarItemIds } from '@/lib/ai/findSimilar';
import { isMediaKind } from '@/lib/itemKinds';
import { useDescriptionStore } from '@/state/descriptionStore';
import { en } from '@/i18n/en';
import { SuggestionsSection } from '@/features/ai/SuggestionsSection';

const MOST_USED_TYPE_COUNT = 8;

/** Details panel for a single selected item — §2.6. Bulk (several items) lands in M2-4. */
export function DetailsPanel({
  platform,
  item,
  engine,
}: {
  platform: Platform;
  item: Item;
  engine: Engine | null;
}) {
  const terms = useTermStore((s) => s.terms);
  const itemTermIds = useTermStore((s) => s.itemTerms.get(item.id)) ?? new Set<string>();

  const typeTerms = useMemo(
    () => [...terms.values()].filter((t) => t.facet === 'type').sort((a, b) => a.sort - b.sort),
    [terms],
  );
  const vibeTerms = useMemo(() => [...terms.values()].filter((t) => t.facet === 'vibe'), [terms]);
  const movementTerms = useMemo(
    () => [...terms.values()].filter((t) => t.facet === 'movement'),
    [terms],
  );
  const tagTerms = useMemo(() => [...terms.values()].filter((t) => t.facet === 'tag'), [terms]);

  const allItemTerms = useTermStore((s) => s.itemTerms);
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ids of allItemTerms.values()) {
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [allItemTerms]);
  const mostUsedTypes = useMemo(
    () =>
      [...typeTerms]
        .sort((a, b) => (usageCounts.get(b.id) ?? 0) - (usageCounts.get(a.id) ?? 0))
        .slice(0, MOST_USED_TYPE_COUNT),
    [typeTerms, usageCounts],
  );

  const currentTypeId = [...itemTermIds].find((id) => terms.get(id)?.facet === 'type') ?? null;
  const vibeValues = [...itemTermIds]
    .map((id) => terms.get(id))
    .filter((t) => t?.facet === 'vibe')
    .map((t) => t!.name);
  const movementValues = [...itemTermIds]
    .map((id) => terms.get(id))
    .filter((t) => t?.facet === 'movement')
    .map((t) => t!.name);
  const tagValues = [...itemTermIds]
    .map((id) => terms.get(id))
    .filter((t) => t?.facet === 'tag')
    .map((t) => t!.name);

  const [showAllTypes, setShowAllTypes] = useState(false);
  const items = useLibraryStore((s) => s.items);
  const embeddings = useEmbeddingsStore((s) => s.vectors);
  const hasEmbedding = embeddings.has(item.id);
  const manualConnections = useManualConnectionsStore((s) => s.connections);
  const manualByItem = useManualConnectionsStore((s) => s.byItem);
  const connections = useMemo(
    () =>
      [...(manualByItem.get(item.id) ?? [])]
        .map((id) => manualConnections.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    [manualByItem, manualConnections, item.id],
  );

  function removeConnection(connectionId: string): void {
    void useHistoryStore.getState().execute(createRemoveConnectionCommand(platform, connectionId));
  }

  function setType(termRef: { id: string } | { name: string }): void {
    void useHistoryStore.getState().execute(createSetItemTypeCommand(platform, item.id, termRef));
  }

  function addTerm(facet: 'vibe' | 'movement' | 'tag', name: string): void {
    const existing = [...terms.values()].find(
      (t) => t.facet === facet && t.name.toLowerCase() === name.toLowerCase(),
    );
    void useHistoryStore
      .getState()
      .execute(
        createAddItemTermCommand(
          platform,
          item.id,
          facet,
          existing ? { id: existing.id } : { name },
        ),
      );
  }

  function removeTerm(facet: 'vibe' | 'movement' | 'tag', name: string): void {
    const term = [...itemTermIds]
      .map((id) => terms.get(id))
      .find((t) => t?.facet === facet && t?.name === name);
    if (term)
      void useHistoryStore
        .getState()
        .execute(createRemoveItemTermCommand(platform, item.id, term.id));
  }

  function setField(field: 'title' | 'artist' | 'sourceUrl' | 'why', value: string): void {
    void useHistoryStore
      .getState()
      .execute(createSetItemFieldCommand(platform, item.id, field, value || null));
  }

  function toggleFavorite(): void {
    void useHistoryStore
      .getState()
      .execute(createSetItemFieldCommand(platform, item.id, 'favorite', !item.favorite));
  }

  function findSimilar(): void {
    const results = findSimilarItemIds(item.id, embeddings);
    if (results.length === 0 || !engine) return;
    const ids = results.map((r) => r.id);
    engine.setSelection(ids);
    engine.zoomToIds(ids);
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflowY: 'auto' }}
    >
      {item.kind === 'image' && item.status === 'ok' && (
        <button
          type="button"
          onClick={() => useFocusStore.getState().open(item.id)}
          style={{
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            aspectRatio: '4 / 3',
            background: 'var(--surface-2)',
          }}
        >
          <img
            src={platform.cache.url(`t512/${item.id}`)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </button>
      )}

      {hasEmbedding && (
        <Button
          variant="ghost"
          icon={<Sparkles size={16} strokeWidth={1.75} />}
          onClick={findSimilar}
        >
          {en.details.findSimilar}
        </Button>
      )}

      <input
        aria-label="Title"
        key={item.title}
        className="ds-chip-input__field"
        defaultValue={item.title}
        onBlur={(e) => setField('title', e.target.value)}
      />

      {isMediaKind(item.kind) && (
        <Field label={en.description.field}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p
              style={{
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                color: item.descriptionText?.trim() ? 'var(--text-1)' : 'var(--text-3)',
              }}
            >
              {item.descriptionText?.trim() || en.description.empty}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                engine?.zoomToIds([item.id]);
                useDescriptionStore.getState().open(item.id);
              }}
            >
              {en.description.open}
            </Button>
          </div>
        </Field>
      )}

      <Field label={en.vocabulary.facets.type}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {(showAllTypes ? typeTerms : mostUsedTypes).map((t) => (
            <button
              key={t.id}
              type="button"
              className="ds-chip"
              style={
                t.id === currentTypeId
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : undefined
              }
              onClick={() => setType({ id: t.id })}
            >
              {t.name}
            </button>
          ))}
          {!showAllTypes && typeTerms.length > MOST_USED_TYPE_COUNT && (
            <button type="button" className="ds-chip" onClick={() => setShowAllTypes(true)}>
              {en.details.typeMore}
            </button>
          )}
        </div>
      </Field>

      <Field label={en.vocabulary.facets.vibe}>
        <ChipInput
          values={vibeValues}
          onAdd={(v) => addTerm('vibe', v)}
          onRemove={(v) => removeTerm('vibe', v)}
          placeholder={en.details.vibePlaceholder}
          suggestions={vibeTerms.map((t) => t.name)}
        />
      </Field>
      <Field label={en.vocabulary.facets.movement}>
        <ChipInput
          values={movementValues}
          onAdd={(v) => addTerm('movement', v)}
          onRemove={(v) => removeTerm('movement', v)}
          placeholder={en.details.movementPlaceholder}
          suggestions={movementTerms.map((t) => t.name)}
        />
      </Field>
      <Field label={en.vocabulary.facets.tag}>
        <ChipInput
          values={tagValues}
          onAdd={(v) => addTerm('tag', v)}
          onRemove={(v) => removeTerm('tag', v)}
          placeholder={en.details.tagsPlaceholder}
          suggestions={tagTerms.map((t) => t.name)}
        />
      </Field>

      <SuggestionsSection platform={platform} item={item} />

      <Field label={en.connections.myConnections}>
        {connections.length === 0 ? (
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            {en.connections.noConnections}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {connections.map((c) => {
              const otherId = c.fromId === item.id ? c.toId : c.fromId;
              const otherTitle = items.get(otherId)?.title ?? otherId;
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span>{c.label ? `${otherTitle} — ${c.label}` : otherTitle}</span>
                  <IconButton
                    icon={<X size={14} strokeWidth={1.75} />}
                    label={en.connections.removeConnection}
                    onClick={() => removeConnection(c.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Field>

      {item.palette && item.palette.length > 0 && (
        <Field label={en.details.colors}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {item.palette.map((p) => (
              <Swatch key={p.hex} hex={p.hex} />
            ))}
          </div>
        </Field>
      )}

      <Field label={en.details.artist}>
        <input
          aria-label={en.details.artist}
          key={item.artist ?? ''}
          className="ds-chip-input__field"
          defaultValue={item.artist ?? ''}
          placeholder={en.details.artistPlaceholder}
          onBlur={(e) => setField('artist', e.target.value)}
        />
      </Field>

      <Field label={en.details.source}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            aria-label={en.details.source}
            key={item.sourceUrl ?? ''}
            className="ds-chip-input__field"
            defaultValue={item.sourceUrl ?? ''}
            placeholder={en.details.sourcePlaceholder}
            style={{ flex: 1 }}
            onBlur={(e) => setField('sourceUrl', e.target.value)}
          />
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={en.details.openSource}
            >
              <ExternalLink size={16} strokeWidth={1.75} />
            </a>
          )}
        </div>
      </Field>

      <Field label={en.details.why}>
        <textarea
          aria-label={en.details.why}
          key={item.why ?? ''}
          className="ds-chip-input__field"
          defaultValue={item.why ?? ''}
          placeholder={en.details.whyPlaceholder}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
          onBlur={(e) => setField('why', e.target.value)}
        />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{en.details.favorite}</span>
        <Toggle checked={item.favorite} onChange={toggleFavorite} label={en.details.favorite} />
      </div>

      <Field label={en.details.info}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <InfoRow label={en.details.infoKind} value={en.kind[item.kind]} />
          <InfoRow
            label={en.details.infoAdded}
            value={new Date(item.createdAt).toLocaleDateString()}
          />
          {item.width && item.height && (
            <InfoRow label={en.details.infoDimensions} value={`${item.width} × ${item.height}`} />
          )}
          {item.fileSize != null && (
            <InfoRow label={en.details.infoSize} value={formatBytes(item.fileSize)} />
          )}
          {item.durationMs != null && (
            <InfoRow label={en.details.infoDuration} value={formatDuration(item.durationMs)} />
          )}
          {item.pageCount != null && (
            <InfoRow label={en.details.infoPages} value={String(item.pageCount)} />
          )}
          {item.filePath && <InfoRow label={en.details.infoLocation} value={item.filePath} />}
        </div>
        {item.filePath && (
          <Button
            variant="ghost"
            onClick={() => void platform.media.reveal(item.filePath!)}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {en.details.showInExplorer}
          </Button>
        )}
      </Field>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
