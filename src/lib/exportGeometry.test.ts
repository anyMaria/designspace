import { describe, expect, it } from 'vitest';
import {
  EXPORT_PADDING_WORLD,
  exportFileName,
  exportRectForCards,
  fitRectToPage,
} from './exportGeometry';

describe('exportRectForCards', () => {
  it('returns null for an empty board', () => {
    expect(exportRectForCards([])).toBeNull();
  });

  it('pads the union of every card rect', () => {
    const result = exportRectForCards([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 200, y: 50, w: 100, h: 100 },
    ]);
    expect(result).toEqual({
      x: 0 - EXPORT_PADDING_WORLD,
      y: 0 - EXPORT_PADDING_WORLD,
      w: 300 + EXPORT_PADDING_WORLD * 2,
      h: 150 + EXPORT_PADDING_WORLD * 2,
    });
  });
});

describe('fitRectToPage', () => {
  it('centers a rect narrower than the page, scaled to the page height', () => {
    const result = fitRectToPage({ w: 100, h: 100 }, { w: 400, h: 200 });
    expect(result).toEqual({ x: 100, y: 0, w: 200, h: 200 });
  });

  it('scales a rect wider than the page down to the page width', () => {
    const result = fitRectToPage({ w: 800, h: 200 }, { w: 400, h: 200 });
    expect(result).toEqual({ x: 0, y: 50, w: 400, h: 100 });
  });

  it('returns an empty rect for a degenerate (zero-size) input rather than dividing by zero', () => {
    expect(fitRectToPage({ w: 0, h: 0 }, { w: 400, h: 200 })).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    });
  });
});

describe('exportFileName', () => {
  it('appends the extension to the title', () => {
    expect(exportFileName('Moodboard', 'png')).toBe('Moodboard.png');
  });

  it('strips path-hostile characters', () => {
    expect(exportFileName('Q3: Kitchen/Bath?', 'pdf')).toBe('Q3- Kitchen-Bath-.pdf');
  });

  it('falls back to "export" for a blank title', () => {
    expect(exportFileName('   ', 'png')).toBe('export.png');
  });
});
