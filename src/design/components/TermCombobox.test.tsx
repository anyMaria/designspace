import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TermCombobox } from './TermCombobox';

const options = [
  { id: 'v1', name: 'Dreamy', count: 5 },
  { id: 'v2', name: 'Grain', count: 2 },
];

function setup(onAdd = vi.fn()) {
  render(
    <TermCombobox
      label="Vibe"
      values={[]}
      options={options}
      onAdd={onAdd}
      onRemove={() => undefined}
      dotColor="red"
      newWordLabel="new vibe"
    />,
  );
  return { input: screen.getByRole('combobox', { name: 'Vibe' }), onAdd };
}

afterEach(cleanup);

describe('TermCombobox', () => {
  it('a typo plus Enter adds the existing word with its own spelling', () => {
    const { input, onAdd } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'dremy' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('Dreamy');
  });

  it('a new word is only made on purpose: ↓ to Create, then Enter', () => {
    const { input, onAdd } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'dremy' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('dremy');
  });

  it('with no match the Create row is highlighted, so Enter creates', () => {
    const { input, onAdd } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzzzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('zzzzzz');
  });

  it('marks the typo match with "Did you mean?"', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'dremy' } });
    expect(screen.getByText('Did you mean?')).toBeTruthy();
  });

  it('leaving the field creates nothing', () => {
    const { input, onAdd } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'newword' } });
    fireEvent.blur(input);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('Esc closes the open list and the event is default-prevented', () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeTruthy();
    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });
    expect(notPrevented).toBe(false); // defaultPrevented
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
