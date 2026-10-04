const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'url',
  'email',
  'number',
  'password',
  'tel',
]);

/** True when keyboard focus is in something the owner types into (a text-like `<input>`,
 * `<textarea>`, `<select>` or a contenteditable), so single-key shortcuts and Esc leave it alone.
 * Ranges, checkboxes and buttons are not typing targets. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}
