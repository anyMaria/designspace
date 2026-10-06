import { describe, expect, it } from 'vitest';
import { classifyPaste } from './pasteKind';

const base = { fileCount: 0, text: '', html: '' };

describe('classifyPaste', () => {
  it('prefers files', () => {
    expect(classifyPaste({ ...base, fileCount: 1, text: 'https://a.com' })).toBe('files');
  });
  it('detects a URL', () => {
    expect(classifyPaste({ ...base, text: 'https://example.com/a?b=1' })).toBe('link');
  });
  it('ignores spaces around a URL', () => {
    expect(classifyPaste({ ...base, text: '  https://example.com \n' })).toBe('link');
  });
  it('keeps a bare www. address as a note', () => {
    expect(classifyPaste({ ...base, text: 'www.example.com' })).toBe('note');
  });
  it('treats empty text as a possible picture', () => {
    expect(classifyPaste(base)).toBe('maybe-image');
  });
  it('turns plain text into a note, even with HTML alongside', () => {
    expect(classifyPaste({ ...base, text: 'hello', html: '<b>hello</b>' })).toBe('note');
  });
  it('treats a link with HTML as a link', () => {
    expect(
      classifyPaste({ ...base, text: 'https://a.com', html: '<a href="https://a.com">a</a>' }),
    ).toBe('link');
  });
});
