import type { DbRow, Platform } from '@/platform/types';
import { runMediaCheck } from './runMediaCheck';
import { failedThumbCount } from '@/lib/thumbLoader';
import { en } from '@/i18n/en';

/** Plain text for "Copy a problem report" (Patch 2 · A12): what this PC sees, to paste into a
 * conversation. No item titles or file names; the log tail is whatever the log itself contains. */
export async function buildProblemReport(platform: Platform): Promise<string> {
  const info = await platform.app.problemReportInfo();
  const counts = await platform.db.select<DbRow>(
    'SELECT kind, status, COUNT(*) AS n FROM items GROUP BY kind, status ORDER BY kind, status',
  );
  let media: string[];
  try {
    media = await runMediaCheck(platform);
  } catch (err) {
    media = [String(err)];
  }

  const lines = [
    `Designspace ${info.appVersion}`,
    `System: ${info.os} ${info.arch}`,
    `Web view: ${info.webviewVersion ?? 'unknown'}`,
    `Library id: ${info.libraryId} (stored: ${info.storedLibraryId ?? 'none'})`,
    `Cache: ${info.cacheFolderCount} folders, ${info.cacheFileCount} files for this library`,
    '',
    'Items (kind, status: count)',
    ...counts.map((r) => `  ${String(r.kind)}, ${String(r.status)}: ${String(r.n)}`),
    '',
    '',
    en.settings.diagnostics.failedPreviews(failedThumbCount()),
    '',
    'Media check',
    ...(media.length > 0 ? media.map((l) => `  ${l}`) : ['  no imported files']),
    '',
    'Log (last lines)',
    info.logTail || '(empty)',
  ];
  return lines.join('\n');
}
