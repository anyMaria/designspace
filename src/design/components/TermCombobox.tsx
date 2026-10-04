import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { Chip } from './Chip';
import { matchTerms, type TermOption } from '@/lib/termMatch';
import { en } from '@/i18n/en';

export interface TermComboboxProps {
  /** aria-label of the input, e.g. `en.vocabulary.facets.vibe`. */
  label: string;
  /** The item's current words (chips). */
  values: string[];
  /** Every existing word of this field, with its use count. */
  options: TermOption[];
  /** An existing name (exact spelling) or a new one. */
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  placeholder?: string;
  /** 'var(--criterion-vibe)' etc. */
  dotColor: string;
  /** Shown on the Create row: "new vibe" / "new movement" / "new tag". */
  newWordLabel: string;
}

/** The word field for Vibe, Movement and Tags (Patch 2 · D1): chips plus an input whose list shows
 * existing words first (most used first), forgives typos ("Did you mean?"), and only makes a new
 * word on purpose (Enter or a click on the Create row, never on leaving the field). */
export function TermCombobox({
  label,
  values,
  options,
  onAdd,
  onRemove,
  placeholder,
  dotColor,
  newWordLabel,
}: TermComboboxProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const result = useMemo(() => matchTerms(query, options, values), [query, options, values]);
  const trimmed = query.trim();
  // Rows: the matches, then the Create row when a new word can be made.
  const rowCount = result.matches.length + (result.canCreate ? 1 : 0);
  // The first match is highlighted; with no match, the Create row.
  const active = Math.min(highlight, Math.max(0, rowCount - 1));

  function add(index: number): void {
    const match = result.matches[index];
    if (match) onAdd(match.name);
    else if (result.canCreate && trimmed) onAdd(trimmed);
    else return;
    setQuery('');
    setHighlight(0);
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(Math.min(active + 1, Math.max(0, rowCount - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rowCount > 0) add(active);
    } else if (e.key === 'Escape') {
      // Close the list first, then leave the field; either way the global Esc stays out of it.
      e.preventDefault();
      if (open) setOpen(false);
      else (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'Backspace' && query === '' && values.length > 0) {
      onRemove(values[values.length - 1]);
    }
  }

  const showList = open && (rowCount > 0 || query === '');
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div>
      <div className="ds-chip-input">
        {values.map((v) => (
          <Chip key={v} onRemove={() => onRemove(v)}>
            {v}
          </Chip>
        ))}
        <input
          className="ds-chip-input__field"
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && rowCount > 0 ? optionId(active) : undefined}
          value={query}
          placeholder={values.length === 0 ? placeholder : undefined}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Leaving the field never creates a word (Patch 2 · P6).
            setOpen(false);
            setQuery('');
          }}
        />
      </div>
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="ds-menu ds-combobox__list"
          onMouseDown={(e) => e.preventDefault()}
        >
          {query === '' && result.matches.length > 0 && (
            <div className="ds-menu__header">{en.combobox.mostUsed}</div>
          )}
          {result.matches.map((o, i) => (
            <div
              key={o.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="ds-menu__item ds-combobox__row"
              data-active={i === active || undefined}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => add(i)}
            >
              <span aria-hidden className="ds-combobox__dot" style={{ background: dotColor }} />
              <span className="ds-menu__main">
                <span className="ds-menu__label">
                  {o.name}
                  {result.didYouMean?.id === o.id && (
                    <span className="ds-combobox__hint"> {en.combobox.didYouMean}</span>
                  )}
                </span>
              </span>
              <span className="ds-menu__trailing">{o.count}</span>
            </div>
          ))}
          {result.canCreate && trimmed && (
            <>
              {result.matches.length > 0 && <div className="ds-menu__separator" role="separator" />}
              <div
                id={optionId(result.matches.length)}
                role="option"
                aria-selected={active === result.matches.length}
                className="ds-menu__item ds-combobox__row"
                data-active={active === result.matches.length || undefined}
                onMouseEnter={() => setHighlight(result.matches.length)}
                onClick={() => add(result.matches.length)}
              >
                <Plus size={14} strokeWidth={2} aria-hidden />
                <span className="ds-menu__main">
                  <span className="ds-menu__label">{en.combobox.create(trimmed)}</span>
                </span>
                <span className="ds-menu__trailing">{newWordLabel}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
