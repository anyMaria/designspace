import type { FontCardOptions, FontFile, Item } from '@/state/types';

/** Family-level helpers for font items (Patch 2 · F1). Pure: no DOM, no database. */

/** The key that finds a family on import: its name, lowercased, without accents or spaces. */
export function familyKey(meta: { family: string }): string {
  return meta.family
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** A type collection is a font item with no file that lists families (Patch 2 · F5). */
export function isFontCollection(item: Pick<Item, 'kind' | 'fontCollection'>): boolean {
  return item.kind === 'font' && !!item.fontCollection;
}

const DEFAULT_WEIGHT = 400;

function closestTo400<T>(entries: T[], weightOf: (e: T) => number): T | undefined {
  let best: T | undefined;
  for (const e of entries) {
    if (!best) {
      best = e;
      continue;
    }
    const d = Math.abs(weightOf(e) - DEFAULT_WEIGHT);
    const bd = Math.abs(weightOf(best) - DEFAULT_WEIGHT);
    if (d < bd || (d === bd && weightOf(e) < weightOf(best))) best = e;
  }
  return best;
}

function wghtAxis(file: FontFile): { min: number; max: number } | null {
  const axis = file.axes?.find((a) => a.tag === 'wght');
  return axis ? { min: axis.min, max: axis.max } : null;
}

/** The weight a file shows at a given "weight" slider: 400 when its axis spans it, else the axis
 * value closest to 400. null for a static file. */
export function defaultWeightOf(file: FontFile): number | null {
  const axis = wghtAxis(file);
  if (!axis) return null;
  return Math.min(axis.max, Math.max(axis.min, DEFAULT_WEIGHT));
}

/** The style a new family card shows: non-italic first, then the weight closest to 400 (ties go
 * to the lighter one). A variable file whose weight axis spans 400 shows 400. */
export function pickDefaultStyle(files: FontFile[]): {
  fileId: string | null;
  wght: number | null;
} {
  if (files.length === 0) return { fileId: null, wght: null };
  const upright = files.filter((f) => !f.italic);
  const pool = upright.length > 0 ? upright : files;
  const best = closestTo400(pool, (f) => {
    const axis = wghtAxis(f);
    return axis ? (defaultWeightOf(f) ?? f.weight) : f.weight;
  });
  if (!best) return { fileId: null, wght: null };
  return { fileId: best.id, wght: defaultWeightOf(best) };
}

/** What the card of a family shows: the stored options, or the defaults. */
export function fontCardOf(item: Pick<Item, 'fontCard'>, files: FontFile[]): FontCardOptions {
  const stored = item.fontCard;
  if (stored && (stored.fileId === null || files.some((f) => f.id === stored.fileId))) {
    return { fileId: stored.fileId, wght: stored.wght, size: stored.size, text: stored.text };
  }
  const def = pickDefaultStyle(files);
  return { fileId: def.fileId, wght: def.wght, size: 'm', text: stored?.text ?? null };
}

/** The file a card shows. */
export function cardFile(card: FontCardOptions, files: FontFile[]): FontFile | undefined {
  return files.find((f) => f.id === card.fileId) ?? files[0];
}
