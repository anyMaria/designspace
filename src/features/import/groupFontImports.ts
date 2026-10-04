/** Patch 2 · F3: which of the fonts in one import belong together. A font family is one card, so
 * every file of a batch with the same key joins the first of them (its main file), and a file whose
 * family already exists in the library joins that item instead of making a new card. */
export interface FontImportEntry {
  index: number;
  key: string;
  vendorId: string | null;
}

export type FontImportPlacement =
  { kind: 'existing'; itemId: string } | { kind: 'new'; groupIndex: number };

export function groupFontImports(
  entries: FontImportEntry[],
  existing: Map<string, string>,
): FontImportPlacement[] {
  const groups: { key: string; vendorId: string | null }[] = [];
  return entries.map((entry) => {
    const known = entry.key ? existing.get(entry.key) : undefined;
    if (known) return { kind: 'existing', itemId: known };
    // An empty key (unreadable file) never joins another file.
    const found = entry.key
      ? groups.findIndex(
          (g) =>
            g.key === entry.key &&
            (g.vendorId === null || entry.vendorId === null || g.vendorId === entry.vendorId),
        )
      : -1;
    if (found >= 0) {
      groups[found].vendorId ??= entry.vendorId;
      return { kind: 'new', groupIndex: found };
    }
    groups.push({ key: entry.key, vendorId: entry.vendorId });
    return { kind: 'new', groupIndex: groups.length - 1 };
  });
}
