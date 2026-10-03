import { describe, expect, it } from 'vitest';
import { extractHashtags, hashtagLines } from './hashtags';

describe('extractHashtags', () => {
  it('finds plain tags with dashes, underscores, digits and accents', () => {
    expect(extractHashtags('#dig-into this')).toEqual(['dig-into']);
    expect(extractHashtags('un #rêve')).toEqual(['rêve']);
    expect(extractHashtags('#to_do and #2026')).toEqual(['to_do', '2026']);
  });
  it('finds a tag at the start of the text and after "("', () => {
    expect(extractHashtags('#first')).toEqual(['first']);
    expect(extractHashtags('see (#later)')).toEqual(['later']);
  });
  it('ignores URLs, double hashes, a lone # and tags glued to words', () => {
    expect(extractHashtags('site.com/#top')).toEqual([]);
    expect(extractHashtags('## heading')).toEqual([]);
    expect(extractHashtags('a # b')).toEqual([]);
    expect(extractHashtags('word#glued')).toEqual([]);
  });
  it('lower-cases and collapses duplicates, keeping first-appearance order', () => {
    expect(extractHashtags('#Beta #alpha #BETA')).toEqual(['beta', 'alpha']);
  });
});

describe('hashtagLines', () => {
  it('pairs each tag with its line, trimmed and clamped', () => {
    const long = `#x ${'a'.repeat(300)}`;
    const out = hashtagLines(`  buy paint #todo  \n\nnothing here\n${long}`);
    expect(out[0]).toEqual({ tag: 'todo', line: 'buy paint #todo' });
    expect(out).toHaveLength(2);
    expect(out[1].line.length).toBe(160);
    expect(out[1].line.endsWith('…')).toBe(true);
  });
});
