import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Facet, Term } from '@/state/types';
import { useTermStore } from '@/state/termStore';
import { useHistoryStore } from '@/commands/history';
import {
  createDeleteTermCommand,
  createMergeTermsCommand,
  createMoveTermCommand,
  createReorderTermsCommand,
  createRenameTermCommand,
  createSetAiHintCommand,
} from '@/commands/vocabularyCommands';
import { Tabs, IconButton, Button } from '@/design/components';
import { en } from '@/i18n/en';

const FACETS: Facet[] = ['type', 'vibe', 'movement', 'tag'];

/** Settings → Vocabularies (§2.5): rename, merge, delete, reorder, and an AI hint per value. */
const MOVABLE_FACETS = ['vibe', 'movement', 'tag'] as const;

export function VocabularySection({ platform }: { platform: Platform }) {
  const [facet, setFacet] = useState<Facet>('type');
  const terms = useTermStore((s) => s.terms);
  const ordered = [...terms.values()]
    .filter((t) => t.facet === facet)
    .sort((a, b) => a.sort - b.sort);

  function move(term: Term, direction: -1 | 1): void {
    const index = ordered.findIndex((t) => t.id === term.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const ids = ordered.map((t) => t.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void useHistoryStore.getState().execute(createReorderTermsCommand(platform, facet, ids));
  }

  function rename(term: Term, name: string): void {
    if (!name.trim() || name === term.name) return;
    void useHistoryStore
      .getState()
      .execute(createRenameTermCommand(platform, term.id, name.trim()));
  }

  function setHint(term: Term, hint: string): void {
    const trimmed = hint.trim();
    if (trimmed === (term.aiHint ?? '')) return;
    void useHistoryStore
      .getState()
      .execute(createSetAiHintCommand(platform, term.id, trimmed || null));
  }

  function moveToFacet(term: Term, toFacet: 'vibe' | 'movement' | 'tag'): void {
    void useHistoryStore.getState().execute(createMoveTermCommand(platform, term.id, toFacet));
  }

  function remove(term: Term): void {
    if (window.confirm(en.vocabulary.deleteConfirm(term.name))) {
      void useHistoryStore.getState().execute(createDeleteTermCommand(platform, term.id));
    }
  }

  function merge(term: Term, targetId: string): void {
    const target = terms.get(targetId);
    if (!target) return;
    if (window.confirm(en.vocabulary.mergeConfirm(term.name, target.name))) {
      void useHistoryStore.getState().execute(createMergeTermsCommand(platform, term.id, targetId));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Tabs
        aria-label="Vocabulary"
        value={facet}
        onChange={setFacet}
        tabs={FACETS.map((f) => ({ id: f, label: en.vocabulary.facets[f] }))}
      />

      {ordered.length === 0 ? (
        <p style={{ color: 'var(--text-2)' }}>{en.vocabulary.empty}</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {ordered.map((term, index) => (
            <VocabularyRow
              key={term.id}
              term={term}
              others={ordered.filter((t) => t.id !== term.id)}
              canMoveUp={index > 0}
              canMoveDown={index < ordered.length - 1}
              onMove={(dir) => move(term, dir)}
              onRename={(name) => rename(term, name)}
              onSetHint={(hint) => setHint(term, hint)}
              onDelete={() => remove(term)}
              onMerge={(targetId) => merge(term, targetId)}
              moveTargets={MOVABLE_FACETS.filter((f) => f !== facet && facet !== 'type')}
              onMoveToFacet={(f) => moveToFacet(term, f)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VocabularyRow({
  term,
  others,
  canMoveUp,
  canMoveDown,
  onMove,
  onRename,
  onSetHint,
  onDelete,
  onMerge,
  moveTargets,
  onMoveToFacet,
}: {
  term: Term;
  others: Term[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onRename: (name: string) => void;
  onSetHint: (hint: string) => void;
  onDelete: () => void;
  onMerge: (targetId: string) => void;
  /** The other fields this word can move to (none for a Type). */
  moveTargets: ('vibe' | 'movement' | 'tag')[];
  onMoveToFacet: (facet: 'vibe' | 'movement' | 'tag') => void;
}) {
  const [mergeTarget, setMergeTarget] = useState('');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        padding: 'var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton
            icon={<ChevronUp size={14} strokeWidth={2} />}
            label={en.vocabulary.moveUp}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon={<ChevronDown size={14} strokeWidth={2} />}
            label={en.vocabulary.moveDown}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          />
        </div>
        <input
          key={term.name}
          aria-label={`Name: ${term.name}`}
          className="ds-chip-input__field"
          defaultValue={term.name}
          style={{ flex: 1, minWidth: 0 }}
          onBlur={(e) => onRename(e.target.value)}
        />
        <Button variant="ghost" onClick={onDelete}>
          {en.vocabulary.delete}
        </Button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          paddingLeft: 'calc(24px + var(--space-2))',
          flexWrap: 'wrap',
        }}
      >
        <input
          key={term.aiHint ?? ''}
          aria-label={`AI hint for ${term.name}`}
          className="ds-chip-input__field"
          defaultValue={term.aiHint ?? ''}
          placeholder={en.vocabulary.aiHintPlaceholder}
          style={{ flex: 1, minWidth: 0, color: 'var(--text-2)' }}
          onBlur={(e) => onSetHint(e.target.value)}
        />
        {moveTargets.length > 0 && (
          <select
            aria-label={`${en.vocabulary.moveTo} ${term.name}`}
            value=""
            onChange={(e) => {
              const target = e.target.value as 'vibe' | 'movement' | 'tag' | '';
              if (target) onMoveToFacet(target);
            }}
            style={{
              background: 'var(--surface-1)',
              color: 'var(--text-1)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-1) var(--space-2)',
              maxWidth: 120,
            }}
          >
            <option value="">{en.vocabulary.moveTo}</option>
            {moveTargets.map((f) => (
              <option key={f} value={f}>
                {en.vocabulary.facets[f]}
              </option>
            ))}
          </select>
        )}
        {others.length > 0 && (
          <>
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              style={{
                background: 'var(--surface-1)',
                color: 'var(--text-1)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-1) var(--space-2)',
                maxWidth: 120,
              }}
            >
              <option value="">{en.vocabulary.mergeInto}</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              disabled={!mergeTarget}
              onClick={() => {
                if (mergeTarget) onMerge(mergeTarget);
                setMergeTarget('');
              }}
            >
              {en.vocabulary.merge}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
