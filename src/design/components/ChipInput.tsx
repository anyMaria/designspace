import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
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
  const listId = useId(); // one datalist per field, so Movement never offers Vibe's words

  function commit() {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft('');
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    // Picking an option from the list replaces the text in one step (not typing): add it at once.
    const inputType = (e.nativeEvent as InputEvent).inputType as string | undefined;
    const picked = inputType === undefined || inputType === 'insertReplacementText';
    if (picked && suggestions.includes(value)) {
      onAdd(value);
      setDraft('');
      return;
    }
    setDraft(value);
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
        list={suggestions.length > 0 ? listId : undefined}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setDraft('')} // leaving a field never creates a word (Patch 2 · P6)
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
