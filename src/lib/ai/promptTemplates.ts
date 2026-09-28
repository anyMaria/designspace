import type { Facet } from '@/state/types';

/** Appendix B — each value's text embedding is the normalized average over its field's
 * templates, where `{x}` is the value's AI hint (or its name). Tags don't use zero-shot
 * suggestions (they come from personal neighbors only — §4.10), so they have no templates here. */
export const PROMPT_TEMPLATES: Partial<Record<Facet, string[]>> = {
  type: ['a {x}', 'an example of {x}', 'a {x} design'],
  vibe: ['a {x} image', 'an image with a {x} mood', 'something that feels {x}'],
  movement: ['{x} style', 'an artwork in the {x} style', 'a design inspired by {x}'],
};

export function promptsFor(facet: Facet, hint: string): string[] {
  const templates = PROMPT_TEMPLATES[facet];
  if (!templates) return [];
  return templates.map((t) => t.replace('{x}', hint));
}
