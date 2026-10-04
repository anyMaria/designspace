import { generateText } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HashtagDecorations } from './tiptap/hashtagDecorations';

/** The one extension set every note uses — TipTap's editor (`NoteEditor`), the plain-text
 * extraction for search/the canvas snippet (`noteBodyToPlainText`), and any future HTML export
 * must all agree on this list, or content saved with one set of marks/nodes renders wrong (or
 * drops content) when read back with another. */
export const noteExtensions = [StarterKit, HashtagDecorations];

/** An empty TipTap document — what a brand-new note's `body` starts as. */
export function emptyNoteBody(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** TipTap JSON → plain text, for `items.body_text` (search) and the canvas card's text snippet.
 * `body` is read back from SQLite as `unknown` (a JSON column, no schema enforcement) — a
 * malformed or unexpected shape falls back to an empty string rather than throwing, since a
 * corrupt note's card should render blank, not break the canvas. */
export function noteBodyToPlainText(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  try {
    return generateText(body, noteExtensions).trim();
  } catch {
    return '';
  }
}
