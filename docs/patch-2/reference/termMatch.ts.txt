import { normalize } from '@/lib/normalize';

/** One existing vocabulary value offered by the term combobox. */
export interface TermOption {
  id: string;
  name: string;
  /** How many items use it (most used first when the field is empty). */
  count: number;
}

export interface TermMatchResult {
  /** Options to list, best first (at most `limit`). Never includes values already on the item. */
  matches: TermOption[];
  /** True when the query is non-empty and no value of this field has the same normalized name. */
  canCreate: boolean;
  /** A close existing value when the query looks like a typo of it ("dremy" → Dreamy). */
  didYouMean: TermOption | null;
  /** The value whose normalized name equals the query (already on the item or not). */
  exact: TermOption | null;
}

/** Optimal-string-alignment distance (Levenshtein + adjacent swaps). Small strings only. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Typos allowed for a query of this length: none under 4 letters, 1 up to 7, then 2. */
export function allowedTypos(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

/** 0 = starts with the query, 1 = a word starts with it, 2 = contains it, 3 = typo match, null = no match. */
function tierOf(nameNorm: string, q: string): number | null {
  if (nameNorm.startsWith(q)) return 0;
  if (nameNorm.split(/[\s\-_/&]+/).some((w) => w.startsWith(q))) return 1;
  if (nameNorm.includes(q)) return 2;
  const typos = allowedTypos(q.length);
  if (typos === 0) return null;
  // Compare with the whole name and with the name's prefix of the same length (typing in progress).
  const whole = editDistance(q, nameNorm);
  const prefix = editDistance(q, nameNorm.slice(0, q.length));
  return Math.min(whole, prefix) <= typos ? 3 : null;
}

function byCountThenName(a: TermOption, b: TermOption): number {
  return b.count - a.count || a.name.localeCompare(b.name);
}

/**
 * Ranks a field's existing values for the combobox (Patch 2, D1). Empty query: every value not
 * already on the item, most used first. Otherwise: starts-with, then word-starts-with, then
 * contains, then typo matches; most used first inside each group.
 */
export function matchTerms(
  query: string,
  options: TermOption[],
  selectedNames: string[],
  limit = 8,
): TermMatchResult {
  const q = normalize(query);
  const selected = new Set(selectedNames.map(normalize));
  const exact = q ? (options.find((o) => normalize(o.name) === q) ?? null) : null;
  const available = options.filter((o) => !selected.has(normalize(o.name)));

  if (!q) {
    return {
      matches: [...available].sort(byCountThenName).slice(0, limit),
      canCreate: false,
      didYouMean: null,
      exact: null,
    };
  }

  const tiers: TermOption[][] = [[], [], [], []];
  for (const o of available) {
    const tier = tierOf(normalize(o.name), q);
    if (tier !== null) tiers[tier].push(o);
  }
  const matches = tiers.flatMap((t) => [...t].sort(byCountThenName)).slice(0, limit);

  let didYouMean: TermOption | null = null;
  if (!exact) {
    const typos = allowedTypos(q.length);
    let best = Number.POSITIVE_INFINITY;
    for (const o of options) {
      const dist = editDistance(q, normalize(o.name));
      if (dist <= typos && dist < best) {
        best = dist;
        didYouMean = o;
      }
    }
  }

  return { matches, canCreate: exact === null, didYouMean, exact };
}
