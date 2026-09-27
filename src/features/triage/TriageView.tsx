import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { X, ArrowUpDown } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useTriageStore } from '@/state/triageStore';
import { useHistoryStore } from '@/commands/history';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import {
  createAddItemTermCommand,
  createRemoveItemTermCommand,
  createSetItemTypeCommand,
} from '@/commands/itemTermCommands';
import { ChipInput, IconButton, Toggle, Button } from '@/design/components';
import { en } from '@/i18n/en';

const NUMBER_KEY_COUNT = 9;

/** Full-screen Triage overlay (§2.7): works through the Inbox chip's snapshot one item at a
 * time with a keyboard-first flow. AI suggestion ghost chips ("A accepts all") land with the AI
 * worker in M6 — the `A` key is a documented no-op until then, not wired to anything. Video/PDF/
 * link previews (muted autoplay, page picker, cover+title) don't apply yet either: every seeded
 * and imported item is `kind: 'image'` until those importers land in later milestones. */
export function TriageView({ platform }: { platform: Platform }) {
  const isOpen = useTriageStore((s) => s.isOpen);
  const order = useTriageStore((s) => s.order);
  const index = useTriageStore((s) => s.index);
  const newestFirst = useTriageStore((s) => s.newestFirst);

  const currentId = index < order.length ? order[index] : null;
  const item = useLibraryStore((s) => (currentId ? s.items.get(currentId) : undefined));
  const terms = useTermStore((s) => s.terms);
  const itemTermIds =
    useTermStore((s) => (currentId ? s.itemTerms.get(currentId) : undefined)) ?? new Set<string>();

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

  const vibeContainerRef = useRef<HTMLDivElement>(null);
  const movementContainerRef = useRef<HTMLDivElement>(null);
  const tagContainerRef = useRef<HTMLDivElement>(null);

  function setType(termId: string): void {
    if (!currentId) return;
    void useHistoryStore
      .getState()
      .execute(createSetItemTypeCommand(platform, currentId, { id: termId }));
  }

  function addTerm(facet: 'vibe' | 'movement' | 'tag', name: string): void {
    if (!currentId || !name.trim()) return;
    const existing = [...terms.values()].find(
      (t) => t.facet === facet && t.name.toLowerCase() === name.trim().toLowerCase(),
    );
    void useHistoryStore
      .getState()
      .execute(
        createAddItemTermCommand(
          platform,
          currentId,
          facet,
          existing ? { id: existing.id } : { name: name.trim() },
        ),
      );
  }

  function removeTerm(facet: 'vibe' | 'movement' | 'tag', name: string): void {
    if (!currentId) return;
    const term = [...itemTermIds]
      .map((id) => terms.get(id))
      .find((t) => t?.facet === facet && t?.name === name);
    if (term)
      void useHistoryStore
        .getState()
        .execute(createRemoveItemTermCommand(platform, currentId, term.id));
  }

  function toggleFavorite(): void {
    if (!currentId || !item) return;
    void useHistoryStore
      .getState()
      .execute(createSetItemFieldCommand(platform, currentId, 'favorite', !item.favorite));
  }

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      // `e.target` (not `document.activeElement`) — ChipInput's own Escape handler blurs the
      // field synchronously before this bubbles up, so activeElement would already look "not
      // typing" for the very keystroke that's supposed to stay inside the field.
      const isTyping =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isTyping) return; // ChipInput owns Enter (add value) / Escape (leave field) while typing.

      if (e.key === 'Escape') {
        useTriageStore.getState().close();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        useTriageStore.getState().next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        useTriageStore.getState().prev();
      } else if (e.key >= '1' && e.key <= String(NUMBER_KEY_COUNT)) {
        const term = typeTerms[Number(e.key) - 1];
        if (term) setType(term.id);
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        vibeContainerRef.current?.querySelector('input')?.focus();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        movementContainerRef.current?.querySelector('input')?.focus();
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        tagContainerRef.current?.querySelector('input')?.focus();
      } else if (e.key.toLowerCase() === 's') {
        toggleFavorite();
      }
      // 'a' (accept all AI suggestions) is a no-op until M6 — nothing to accept yet.
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setType/toggleFavorite close over currentId/item, rebuilt every render anyway
  }, [isOpen, typeTerms, currentId, item]);

  if (!isOpen) return null;

  const total = order.length;
  const zero = index >= total;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'var(--canvas)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4)',
        }}
      >
        <span className="font-display">
          {zero ? en.triage.zero : en.triage.progress(index + 1, total)}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {!zero && (
            <IconButton
              icon={<ArrowUpDown size={20} strokeWidth={1.75} />}
              label={newestFirst ? en.triage.newestFirst : en.triage.oldestFirst}
              onClick={() => useTriageStore.getState().toggleOrder()}
            />
          )}
          <IconButton
            icon={<X size={20} strokeWidth={1.75} />}
            label={en.triage.close}
            onClick={() => useTriageStore.getState().close()}
          />
        </div>
      </div>

      {zero || !item ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-4)',
          }}
        >
          <h2 className="font-display">{en.triage.zero}</h2>
          <p style={{ color: 'var(--text-2)' }}>{en.triage.zeroSubtitle}</p>
          <Button variant="primary" onClick={() => useTriageStore.getState().close()}>
            {en.triage.close}
          </Button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div
            style={{
              flex: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-6)',
            }}
          >
            {item.filePath && (
              <img
                src={platform.media.originalUrl(item.filePath)}
                alt={item.title}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            )}
          </div>
          <div
            style={{
              flex: 2,
              overflowY: 'auto',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              borderLeft: '1px solid var(--hairline)',
            }}
          >
            <h3 className="font-display">{item.title}</h3>

            <Field label={en.vocabulary.facets.type}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                {typeTerms.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    className="ds-chip"
                    style={
                      t.id === currentTypeId
                        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                        : undefined
                    }
                    onClick={() => setType(t.id)}
                  >
                    {i < NUMBER_KEY_COUNT && (
                      <span style={{ opacity: 0.6, marginRight: 4 }}>{i + 1}</span>
                    )}
                    {t.name}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={en.vocabulary.facets.vibe}>
              <div ref={vibeContainerRef}>
                <ChipInput
                  values={vibeValues}
                  onAdd={(v) => addTerm('vibe', v)}
                  onRemove={(v) => removeTerm('vibe', v)}
                  placeholder={en.details.vibePlaceholder}
                  suggestions={vibeTerms.map((t) => t.name)}
                />
              </div>
            </Field>
            <Field label={en.vocabulary.facets.movement}>
              <div ref={movementContainerRef}>
                <ChipInput
                  values={movementValues}
                  onAdd={(v) => addTerm('movement', v)}
                  onRemove={(v) => removeTerm('movement', v)}
                  placeholder={en.details.movementPlaceholder}
                  suggestions={movementTerms.map((t) => t.name)}
                />
              </div>
            </Field>
            <Field label={en.vocabulary.facets.tag}>
              <div ref={tagContainerRef}>
                <ChipInput
                  values={tagValues}
                  onAdd={(v) => addTerm('tag', v)}
                  onRemove={(v) => removeTerm('tag', v)}
                  placeholder={en.details.tagsPlaceholder}
                  suggestions={tagTerms.map((t) => t.name)}
                />
              </div>
            </Field>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{en.details.favorite}</span>
              <Toggle
                checked={item.favorite}
                onChange={toggleFavorite}
                label={en.details.favorite}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto' }}>
              {index > 0 && (
                <Button variant="ghost" onClick={() => useTriageStore.getState().prev()}>
                  {en.triage.previous}
                </Button>
              )}
              <Button variant="ghost" onClick={() => useTriageStore.getState().next()}>
                {en.triage.skip}
              </Button>
              <Button variant="primary" onClick={() => useTriageStore.getState().next()}>
                {en.triage.done}
              </Button>
            </div>
          </div>
        </div>
      )}
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
