import type { DbRow, DbStatement, Platform } from '@/platform/types';
import { logger } from '@/lib/logger';
import { parseFont, readMeta, type FontMeta } from '@/lib/fontRender';
import { familyKey } from '@/lib/fontFamily';

/** Patch 2 · F2: a one-off repair that turns "one item per font file" libraries into family
 * items. Derived data, not a Command; the pre-migration backup is the safety net. It runs once
 * (guarded by `meta.font_families_v`) before the library loads. */

const META_KEY = 'font_families_v';
const FONT_DERIVED_V_RESET = 0;

export interface MergeCandidate {
  id: string;
  familyKey: string;
  vendorId: string | null;
  createdAt: string;
}

export interface MergeGroup {
  keptId: string;
  mergedIds: string[];
}

/** Groups items by family key (two items whose vendor ids are both set and differ are different
 * families) and keeps the oldest item of each group. Only groups of 2+ are returned. */
export function planFontMerge(rows: MergeCandidate[]): MergeGroup[] {
  const byKey = new Map<string, MergeCandidate[]>();
  for (const r of rows) {
    if (!r.familyKey) continue;
    const list = byKey.get(r.familyKey) ?? [];
    list.push(r);
    byKey.set(r.familyKey, list);
  }
  const groups: MergeGroup[] = [];
  for (const list of byKey.values()) {
    const sorted = [...list].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    // Sub-groups by vendor: an item without a vendor id joins the first sub-group.
    const clusters: { vendor: string | null; items: MergeCandidate[] }[] = [];
    for (const item of sorted) {
      const home = clusters.find(
        (c) => c.vendor === null || item.vendorId === null || c.vendor === item.vendorId,
      );
      if (home) {
        home.items.push(item);
        home.vendor ??= item.vendorId;
      } else clusters.push({ vendor: item.vendorId, items: [item] });
    }
    for (const c of clusters) {
      if (c.items.length < 2) continue;
      groups.push({ keptId: c.items[0].id, mergedIds: c.items.slice(1).map((i) => i.id) });
    }
  }
  return groups;
}

export interface MergeItemRow {
  id: string;
  title: string;
  fileName: string | null;
  favorite: boolean;
  why: string | null;
  description: string | null;
  descriptionText: string | null;
  artist: string | null;
  sortedAt: string | null;
  viewedAt: string | null;
}

const firstNonEmpty = (...values: (string | null)[]): string | null =>
  values.find((v) => v !== null && v.trim() !== '') ?? null;

const stripExt = (name: string | null): string => (name ?? '').replace(/\.[^.]+$/, '');

/** The statements that fold `merged` items into `kept` (one batch per group). Order matters:
 * files first, then everything that cascades from the merged rows, the rows last. */
export function mergeStatements(
  kept: MergeItemRow,
  merged: MergeItemRow[],
  familyName: string,
): DbStatement[] {
  const k = kept.id;
  const out: DbStatement[] = [];
  for (const { id: m } of merged) {
    out.push({ sql: 'UPDATE font_files SET item_id = ? WHERE item_id = ?', params: [k, m] });
    out.push({
      sql: `INSERT OR IGNORE INTO item_terms (item_id, term_id, via, added_at)
            SELECT ?, term_id, via, added_at FROM item_terms WHERE item_id = ?`,
      params: [k, m],
    });
    out.push({
      sql: `INSERT OR IGNORE INTO ai_dismissed (item_id, term_id)
            SELECT ?, term_id FROM ai_dismissed WHERE item_id = ?`,
      params: [k, m],
    });
    // My connections: drop the ones that would join the family to itself or duplicate a pair (in
    // either direction), then re-point the rest.
    out.push({
      sql: `DELETE FROM manual_connections
            WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)`,
      params: [m, k],
    });
    out.push({
      sql: `DELETE FROM manual_connections WHERE from_id = ?1 AND (
              to_id IN (SELECT to_id FROM manual_connections WHERE from_id = ?2)
              OR to_id IN (SELECT from_id FROM manual_connections WHERE to_id = ?2))`,
      params: [m, k],
    });
    out.push({
      sql: `DELETE FROM manual_connections WHERE to_id = ?1 AND (
              from_id IN (SELECT from_id FROM manual_connections WHERE to_id = ?2)
              OR from_id IN (SELECT to_id FROM manual_connections WHERE from_id = ?2))`,
      params: [m, k],
    });
    out.push({
      sql: 'UPDATE manual_connections SET from_id = ? WHERE from_id = ?',
      params: [k, m],
    });
    out.push({ sql: 'UPDATE manual_connections SET to_id = ? WHERE to_id = ?', params: [k, m] });
    // Placements: per space, the kept item's own placement wins.
    out.push({
      sql: `DELETE FROM placements WHERE item_id = ?1
            AND board_id IN (SELECT board_id FROM placements WHERE item_id = ?2)`,
      params: [m, k],
    });
    out.push({ sql: 'UPDATE placements SET item_id = ? WHERE item_id = ?', params: [k, m] });
    out.push({ sql: 'DELETE FROM embeddings WHERE item_id = ?', params: [m] });
  }

  const all = [kept, ...merged];
  const earliest = all
    .map((r) => r.sortedAt)
    .filter((v): v is string => v !== null)
    .sort()[0];
  const latest = all
    .map((r) => r.viewedAt)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1);
  const title = kept.title === stripExt(kept.fileName) ? familyName : kept.title;
  out.push({
    sql: `UPDATE items SET favorite = ?, why = ?, description = ?, description_text = ?, artist = ?,
            sorted_at = ?, viewed_at = ?, title = ?, derived_v = ?, updated_at = ? WHERE id = ?`,
    params: [
      all.some((r) => r.favorite) ? 1 : 0,
      firstNonEmpty(...all.map((r) => r.why)),
      firstNonEmpty(...all.map((r) => r.description)),
      firstNonEmpty(...all.map((r) => r.descriptionText)),
      firstNonEmpty(...all.map((r) => r.artist)),
      earliest ?? null,
      latest ?? null,
      title,
      FONT_DERIVED_V_RESET,
      new Date().toISOString(),
      k,
    ],
  });
  for (const { id } of merged) out.push({ sql: 'DELETE FROM items WHERE id = ?', params: [id] });
  return out;
}

function toMergeRow(r: DbRow): MergeItemRow {
  const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    fileName: s(r.file_name),
    favorite: Number(r.favorite) === 1,
    why: s(r.why),
    description: s(r.description),
    descriptionText: s(r.description_text),
    artist: s(r.artist),
    sortedAt: s(r.sorted_at),
    viewedAt: s(r.viewed_at),
  };
}

interface Parsed {
  fileId: string;
  itemId: string;
  createdAt: string;
  meta: FontMeta;
}

async function parseFile(platform: Platform, row: DbRow): Promise<Parsed | null> {
  try {
    const res = await fetch(platform.media.originalUrl(String(row.file_path)));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = readMeta(parseFont(await res.arrayBuffer()));
    return {
      fileId: String(row.id),
      itemId: String(row.item_id),
      createdAt: String(row.created_at),
      meta,
    };
  } catch (err) {
    logger.warn('Font file could not be read for the family merge', row.file_path, err);
    return null;
  }
}

/** Upright styles first, lighter before heavier: the order of the Styles list (`sort`). */
export async function renumberFontFiles(platform: Platform, itemId: string): Promise<void> {
  const rows = await platform.db.select<DbRow>(
    `SELECT id FROM font_files WHERE item_id = ? AND deleted_at IS NULL
      ORDER BY italic, weight, style_name, file_name`,
    [itemId],
  );
  await platform.db.batch(
    rows.map((r, i) => ({
      sql: 'UPDATE font_files SET sort = ? WHERE id = ?',
      params: [i, String(r.id)],
    })),
  );
}

/** Runs the repair once. Safe to call on every start. */
export async function mergeFontFamilies(platform: Platform): Promise<void> {
  const done = await platform.db.select<DbRow>('SELECT value FROM meta WHERE key = ?', [META_KEY]);
  if (done.length > 0) return;

  const files = await platform.db.select<DbRow>(
    `SELECT ff.id, ff.item_id, ff.file_path, i.created_at
       FROM font_files ff JOIN items i ON i.id = ff.item_id
      WHERE ff.deleted_at IS NULL AND i.deleted_at IS NULL AND i.kind = 'font'
        AND i.status != 'unsupported' AND i.font_collection IS NULL`,
  );
  const parsed: Parsed[] = [];
  for (const row of files) {
    const p = await parseFile(platform, row);
    if (p) parsed.push(p);
  }

  // Refresh each file's own metadata and its item's family key.
  for (const p of parsed) {
    await platform.db.batch([
      {
        sql: `UPDATE font_files SET style_name = ?, weight = ?, italic = ?, axes = ?, instances = ?, meta = ?
              WHERE id = ?`,
        params: [
          p.meta.styleName,
          p.meta.weight,
          p.meta.italic ? 1 : 0,
          JSON.stringify(p.meta.variableAxes),
          p.meta.instances ? JSON.stringify(p.meta.instances) : null,
          JSON.stringify(p.meta),
          p.fileId,
        ],
      },
      {
        sql: 'UPDATE items SET font_family_key = ? WHERE id = ?',
        params: [familyKey(p.meta), p.itemId],
      },
    ]);
  }

  const candidates: MergeCandidate[] = parsed.map((p) => ({
    id: p.itemId,
    familyKey: familyKey(p.meta),
    vendorId: p.meta.vendorId,
    createdAt: p.createdAt,
  }));
  const groups = planFontMerge(candidates);
  const familyOf = new Map(parsed.map((p) => [p.itemId, p.meta.family]));
  const mergedAll: string[] = [];
  const keptAll: string[] = [];

  for (const g of groups) {
    const ids = [g.keptId, ...g.mergedIds];
    const rows = await platform.db.select<DbRow>(
      `SELECT * FROM items WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    const byId = new Map(rows.map((r) => [String(r.id), toMergeRow(r)]));
    const kept = byId.get(g.keptId);
    const merged = g.mergedIds.map((id) => byId.get(id)).filter((r): r is MergeItemRow => !!r);
    if (!kept) continue;
    await platform.db.batch(mergeStatements(kept, merged, familyOf.get(g.keptId) ?? kept.title));
    await renumberFontFiles(platform, g.keptId);
    mergedAll.push(...merged.map((m) => m.id));
    keptAll.push(g.keptId);
  }

  // The specimens are re-made on the family card: drop the merged items' thumbnails and mark the
  // kept items for a re-render.
  if (mergedAll.length > 0)
    await platform.cache.delete(mergedAll.flatMap((id) => [`t128/${id}`, `t512/${id}`]));
  if (keptAll.length > 0)
    await platform.db.batch(
      keptAll.map((id) => ({ sql: 'UPDATE items SET derived_v = 0 WHERE id = ?', params: [id] })),
    );

  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
    [META_KEY],
  );
}
