import { describe, expect, it } from 'vitest';
import { emptyNoteBody, noteBodyToPlainText } from './noteText';

describe('noteBodyToPlainText', () => {
  it('extracts plain text from a TipTap document', () => {
    const body = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
    };
    expect(noteBodyToPlainText(body)).toBe('Hello there');
  });

  it('separates multiple paragraphs (TipTap default block separator)', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    };
    const text = noteBodyToPlainText(body);
    expect(text).toContain('First');
    expect(text).toContain('Second');
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
  });

  it('returns an empty string for an empty document', () => {
    expect(noteBodyToPlainText(emptyNoteBody())).toBe('');
  });

  it('returns an empty string for null, undefined, or a non-object', () => {
    expect(noteBodyToPlainText(null)).toBe('');
    expect(noteBodyToPlainText(undefined)).toBe('');
    expect(noteBodyToPlainText('not json')).toBe('');
  });

  it('falls back to an empty string for a malformed document rather than throwing', () => {
    expect(noteBodyToPlainText({ type: 'not-a-real-doc-type' })).toBe('');
  });
});
