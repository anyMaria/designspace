import { describe, expect, it } from 'vitest';
import { normalize } from './normalize';

describe('normalize', () => {
  it('lowercases and strips accents so "Rêveur" matches "reveur"', () => {
    expect(normalize('Rêveur')).toBe('reveur');
    expect(normalize('Rêveur')).toBe(normalize('reveur'));
  });

  it('trims surrounding whitespace', () => {
    expect(normalize('  Bauhaus  ')).toBe('bauhaus');
  });

  it('is idempotent', () => {
    const once = normalize('Café Society');
    expect(normalize(once)).toBe(once);
  });
});
