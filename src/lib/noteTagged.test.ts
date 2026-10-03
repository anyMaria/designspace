import { describe, expect, it } from 'vitest';
import { noteBodyToTaggedText } from './noteTagged';

const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const t = (text: string, ...marks: string[]) => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe('noteBodyToTaggedText', () => {
  it('joins paragraphs with newlines and drops trailing blanks', () => {
    expect(noteBodyToTaggedText(doc(p(t('one')), p(t('two')), p()))).toBe('one\ntwo');
  });
  it('wraps bold, italic and both', () => {
    expect(
      noteBodyToTaggedText(doc(p(t('a', 'bold'), t(' b', 'italic'), t(' c', 'bold', 'italic')))),
    ).toBe('<b>a</b><i> b</i><i><b> c</b></i>');
  });
  it('makes headings bold lines', () => {
    expect(
      noteBodyToTaggedText(doc({ type: 'heading', attrs: { level: 2 }, content: [t('Title')] })),
    ).toBe('<b>Title</b>');
  });
  it('prefixes bullets and numbers', () => {
    const li = (s: string) => ({ type: 'listItem', content: [p(t(s))] });
    expect(noteBodyToTaggedText(doc({ type: 'bulletList', content: [li('a'), li('b')] }))).toBe(
      '• a\n• b',
    );
    expect(noteBodyToTaggedText(doc({ type: 'orderedList', content: [li('a'), li('b')] }))).toBe(
      '1. a\n2. b',
    );
  });
  it('wraps hashtags (also inside bold) but not URL fragments', () => {
    expect(noteBodyToTaggedText(doc(p(t('see #dig-into now'))))).toBe(
      'see <dshash>#dig-into</dshash> now',
    );
    expect(noteBodyToTaggedText(doc(p(t('#go', 'bold'))))).toBe('<b><dshash>#go</dshash></b>');
    expect(noteBodyToTaggedText(doc(p(t('a.com/#top'))))).toBe('a.com/#top');
  });
  it('gives an empty string for an empty or malformed body', () => {
    expect(noteBodyToTaggedText(doc(p()))).toBe('');
    expect(noteBodyToTaggedText(null)).toBe('');
    expect(noteBodyToTaggedText('nope')).toBe('');
    expect(noteBodyToTaggedText({ type: 'doc', content: 5 })).toBe('');
  });
});
