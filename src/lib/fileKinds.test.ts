import { describe, expect, it } from 'vitest';
import {
  detectMediaKind,
  extensionOf,
  isSupportedImage,
  isSupportedPdf,
  isSupportedVideo,
} from './fileKinds';

describe('extensionOf', () => {
  it('lowercases and strips the leading dot', () => {
    expect(extensionOf('Photo.JPG')).toBe('jpg');
  });

  it('returns an empty string for a name with no extension', () => {
    expect(extensionOf('README')).toBe('');
  });
});

describe('isSupportedImage / isSupportedVideo', () => {
  it('recognizes every listed image extension', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg']) {
      expect(isSupportedImage(`a.${ext}`)).toBe(true);
    }
  });

  it('recognizes every listed video extension', () => {
    for (const ext of ['mp4', 'webm', 'm4v', 'mov']) {
      expect(isSupportedVideo(`a.${ext}`)).toBe(true);
    }
  });

  it('does not cross-recognize the other kind', () => {
    expect(isSupportedVideo('a.png')).toBe(false);
    expect(isSupportedImage('a.mp4')).toBe(false);
  });

  it('recognizes the pdf extension', () => {
    expect(isSupportedPdf('doc.pdf')).toBe(true);
    expect(isSupportedPdf('doc.PDF')).toBe(true);
    expect(isSupportedPdf('a.png')).toBe(false);
  });
});

describe('detectMediaKind', () => {
  it("returns 'image' for an image extension", () => {
    expect(detectMediaKind('photo.png')).toBe('image');
  });

  it("returns 'video' for a video extension", () => {
    expect(detectMediaKind('clip.mp4')).toBe('video');
  });

  it("returns 'pdf' for a pdf extension", () => {
    expect(detectMediaKind('doc.pdf')).toBe('pdf');
  });

  it('returns null for anything unsupported', () => {
    expect(detectMediaKind('notes.txt')).toBeNull();
  });
});
