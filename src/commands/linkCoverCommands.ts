import type { LinkMeta, Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { getIngestQueue } from '@/workers/ingestQueue';
import type { Command } from './types';

export interface NewCover {
  relPath: string;
  mime: string;
}

/** Sets a link's picture (Patch 3 · B3): the owner chose, pasted or dropped one. The new file is
 * made into thumbnails like any cover. Undo puts back the old `cover_path` and thumbnail version
 * (and makes the old thumbnails again); the imported file stays in the library, as originals are
 * never deleted by undo. */
export function createSetLinkCoverCommand(
  platform: Platform,
  itemId: string,
  cover: NewCover,
): Command {
  const previous = useLibraryStore.getState().items.get(itemId);
  const previousCover = previous?.coverPath ?? null;
  const previousMime = previous?.mime ?? null;
  const previousThumbV = previous?.thumbV ?? 0;
  const previousMeta = previous?.linkMeta ?? null;

  async function apply(
    coverPath: string | null,
    mime: string | null,
    thumbV: number | null,
    meta: LinkMeta | null,
    regenerate: boolean,
  ): Promise<void> {
    const current = useLibraryStore.getState().items.get(itemId);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    const nextMeta = meta ? { ...meta } : null;
    useLibraryStore.getState().upsertItem({
      ...current,
      coverPath,
      mime,
      thumbV: thumbV ?? current.thumbV,
      linkMeta: nextMeta,
      updatedAt,
    });
    await platform.db.execute(
      `UPDATE items SET cover_path = ?, mime = ?, thumb_v = COALESCE(?, thumb_v), link_meta = ?,
       updated_at = ? WHERE id = ?`,
      [coverPath, mime, thumbV, nextMeta ? JSON.stringify(nextMeta) : null, updatedAt, itemId],
    );
    if (regenerate && coverPath && mime) {
      getIngestQueue(platform).enqueue([{ itemId, relPath: coverPath, mime }]);
    }
  }

  const baseMeta: LinkMeta = previousMeta ?? {
    finalUrl: previous?.url ?? '',
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
    faviconUrl: null,
  };
  return {
    label: 'Change link picture',
    do: () => apply(cover.relPath, cover.mime, null, { ...baseMeta, noPicture: false }, true),
    undo: () =>
      apply(previousCover, previousMime, previousThumbV, previousMeta, previousCover !== null),
  };
}
