import { describe, expect, it } from 'vitest';
import { looksLikeImageUrl, parseHttpUrl } from './urlDetect';

describe('parseHttpUrl', () => {
  it('parses a bare http(s) URL', () => {
    expect(parseHttpUrl('https://example.com/path')?.hostname).toBe('example.com');
    expect(parseHttpUrl('http://example.com')?.hostname).toBe('example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(parseHttpUrl('  https://example.com  ')?.hostname).toBe('example.com');
  });

  it('rejects text containing whitespace, even if it has a URL inside', () => {
    expect(parseHttpUrl('check out https://example.com please')).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(parseHttpUrl('ftp://example.com')).toBeNull();
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects plain text and empty input', () => {
    expect(parseHttpUrl('not a url')).toBeNull();
    expect(parseHttpUrl('')).toBeNull();
    expect(parseHttpUrl('   ')).toBeNull();
  });
});

describe('looksLikeImageUrl', () => {
  it('recognizes common image extensions', () => {
    expect(looksLikeImageUrl(new URL('https://example.com/a/b.jpg'))).toBe(true);
    expect(looksLikeImageUrl(new URL('https://example.com/cover.PNG'))).toBe(true);
  });

  it('is false for a non-image extension or no extension at all', () => {
    expect(looksLikeImageUrl(new URL('https://example.com/article'))).toBe(false);
    expect(looksLikeImageUrl(new URL('https://example.com/doc.pdf'))).toBe(false);
  });
});
