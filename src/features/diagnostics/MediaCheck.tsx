import { useState } from 'react';
import type { DbRow, Platform } from '@/platform/types';
import { en } from '@/i18n/en';
import { formatBytes } from '@/lib/formatBytes';
import { logger } from '@/lib/logger';
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

/** Settings → About → Diagnostics → "Check media loading". */
export function MediaCheck({ platform }: { platform: Platform }) {
  const t = en.settings.diagnostics;
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(): Promise<void> {
    setBusy(true);
    try {
      setLines(await runMediaCheck(platform));
    } catch (err) {
      logger.error('Media check failed', err);
      setLines([String(err)]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <button type="button" className="ds-menu__item" disabled={busy} onClick={() => void run()}>
        {busy ? t.mediaChecking : t.mediaCheck}
      </button>
      {lines && (
        <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--text-2)' }}>
          {lines.length === 0 ? (
            <li>{t.mediaNoItems}</li>
          ) : (
            lines.map((l, i) => <li key={i}>{l}</li>)
          )}
        </ul>
      )}
    </div>
  );
}
