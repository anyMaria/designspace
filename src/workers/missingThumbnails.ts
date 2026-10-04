import type { DbRow, Platform } from '@/platform/types';

/** Items marked ready whose t128 is missing from the cache get derived_v = 0, so the resume
 * functions re-make them (Patch 2 · A2). Derived data: not a Command. */
export async function requeueMissingThumbnails(platform: Platform): Promise<number> {
  const rows = await platform.db.select<DbRow>(
    `SELECT id FROM items WHERE deleted_at IS NULL AND status = 'ok'
       AND (kind IN ('image','video','pdf','font') OR (kind = 'link' AND cover_path IS NOT NULL))`,
  );
  const missing: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const ids = rows.slice(i, i + 500).map((r) => String(r.id));
    const has = await platform.cache.has(ids.map((id) => `t128/${id}`));
    missing.push(...ids.filter((_, j) => !has[j]));
  }
  if (missing.length > 0) {
    await platform.db.batch(
      missing.map((id) => ({ sql: 'UPDATE items SET derived_v = 0 WHERE id = ?', params: [id] })),
    );
  }
  return missing.length;
}
