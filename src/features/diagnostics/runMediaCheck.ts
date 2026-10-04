import type { DbRow, Platform } from '@/platform/types';
import { en } from '@/i18n/en';
import { formatBytes } from '@/lib/formatBytes';
import { thumbUrl } from '@/lib/thumbs';

async function probe(label: string, url: string): Promise<string> {
  const t = en.settings.diagnostics;
  try {
    const res = await fetch(url);
    if (!res.ok) return t.mediaFailed(label, `HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    return t.mediaOk(label, formatBytes(bytes.byteLength));
  } catch (err) {
    return t.mediaFailed(label, err instanceof Error ? err.message : String(err));
  }
}

/** One line per check: a few imported originals and thumbnails fetched through the same URLs the
 * canvas uses (thumbnails with `thumb_v`, like the canvas), so a broken `media://` protocol shows
 * up as text instead of silently empty cards. */
export async function runMediaCheck(platform: Platform): Promise<string[]> {
  const t = en.settings.diagnostics;
  const rows = await platform.db.select<DbRow>(
    `SELECT id, file_path, thumb_v FROM items
     WHERE status = 'ok' AND file_path IS NOT NULL AND deleted_at IS NULL LIMIT 3`,
  );
  const out: string[] = [];
  for (const row of rows) {
    const item = { id: String(row.id), thumbV: Number(row.thumb_v ?? 0) };
    out.push(await probe(t.mediaOriginal, platform.media.originalUrl(String(row.file_path))));
    out.push(await probe(t.mediaThumbnail, thumbUrl(platform, item, 128)));
  }
  return out;
}
