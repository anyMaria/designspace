import type { ImportResult } from '@/platform/types';
import { logger } from '@/lib/logger';

/** Pictures to try for one link, best first: the page's candidates, else the single `imageUrl`
 * older links stored. At most `MAX_TRIES`, without repeats. */
const MAX_TRIES = 6;

export function candidatesOf(meta: {
  imageCandidates?: string[];
  imageUrl: string | null;
}): string[] {
  const all = [...(meta.imageCandidates ?? []), ...(meta.imageUrl ? [meta.imageUrl] : [])];
  return [...new Set(all)].slice(0, MAX_TRIES);
}

/** Tries each candidate in order and stops at the first one that downloads as an image (the
 * download itself rejects anything that is not `image/*`). Returns null when none works. */
export async function importFirstImage(
  candidates: string[],
  importUrl: (url: string) => Promise<ImportResult>,
): Promise<ImportResult | null> {
  for (const url of candidates) {
    try {
      return await importUrl(url);
    } catch (err) {
      logger.debug('Link picture candidate failed', url, String(err));
    }
  }
  return null;
}
