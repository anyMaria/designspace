import { useState, type KeyboardEvent } from 'react';
import { Chip } from './Chip';

export interface ChipInputProps {
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
  suggestions?: string[];
}

/** A chip-per-value field with free-text entry. Autocomplete dropdown lands in a later milestone. */
export function ChipInput({
  values,
  onAdd,
  onRemove,
  placeholder,
  suggestions = [],
}: ChipInputProps) {
  const [draft, setDraft] = useState('');

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onRemove(values[values.length - 1]);
    } else if (e.key === 'Escape') {
      setDraft('');
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="ds-chip-input">
      {values.map((v) => (
        <Chip key={v} onRemove={() => onRemove(v)}>
          {v}
        </Chip>
      ))}
      <input
        className="ds-chip-input__field"
        value={draft}
        placeholder={values.length === 0 ? placeholder : undefined}
        list={suggestions.length > 0 ? 'chip-input-suggestions' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      {suggestions.length > 0 && (
        <datalist id="chip-input-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
