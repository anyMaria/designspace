/** Page ranges as the owner types them: "1-3, 7" (Patch 2 · G1). Pages are 1-based in the text and
 * 0-based in the result. */

/** `null` for anything that is not a number or range inside 1…pageCount; `[]` for empty text. */
export function parsePageRange(text: string, pageCount: number): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const out = new Set<number>();
  for (const part of trimmed.split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo < 1 || hi > pageCount) return null;
    for (let n = lo; n <= hi; n++) out.add(n - 1);
  }
  return [...out].sort((x, y) => x - y);
}

/** The reverse: `[0,1,2,6]` → `"1-3, 7"`. */
export function formatPageRange(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i] + 1}-${sorted[j] + 1}` : String(sorted[i] + 1));
    i = j + 1;
  }
  return parts.join(', ');
}
