/**
 * Case- and accent-insensitive comparison for term names and search tokens — §2.5 ("Rêveur" =
 * "reveur") and §4.8. Lowercases, then strips combining diacritical marks after NFD
 * decomposition.
 */
export function normalize(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
