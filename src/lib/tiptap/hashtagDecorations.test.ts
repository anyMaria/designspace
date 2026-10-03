import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { hashtagRanges } from './hashtagDecorations';

const schema = getSchema([StarterKit]);
const doc = (text: string) =>
  schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

describe('hashtagRanges', () => {
  it('covers each hashtag including its #, in document positions', () => {
    const d = doc('go #dig-into now (#later)');
    const texts = hashtagRanges(d).map(([from, to]) => d.textBetween(from, to));
    expect(texts).toEqual(['#dig-into', '#later']);
  });
  it('skips URL fragments', () => {
    expect(hashtagRanges(doc('a.com/#top'))).toEqual([]);
  });
});
