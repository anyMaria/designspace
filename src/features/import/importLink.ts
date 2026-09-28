import type { DbRow, DbStatement, Platform } from '@/platform/types';
import type { Item, Placement } from '@/state/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useToastStore } from '@/state/toastStore';
import { getIngestQueue, CURRENT_DERIVED_V } from '@/workers/ingestQueue';
import { newId } from '@/lib/ids';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';
import {
  planBatchPlacements,
  finishBatch,
  createRow,
  type DropPoint,
  type PlacementTarget,
} from './importItems';
import { looksLikeImageUrl } from '@/lib/urlDetect';

/** Link import (§2.3, §2.4): paste/drop a URL, or the Add menu's "Link…" field. Mirrors
 * `importItems.ts`'s placement/undo/"also lands on the Library map" machinery (reused via the
 * exports above) but the row shape and ingest are different — a link has no local original file
 * (`filePath` stays null), and its metadata/cover come from Rust's `net_link_meta`/
 * `net_download_image` rather than a Worker parsing bytes already on disk. */

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function createLinkRow(
  platform: Platform,
  primary: PlacementTarget,
  url: string,
  extra?: PlacementTarget,
): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  const title = safeHostname(url);

  const statements: DbStatement[] = [
    {
      sql: `INSERT INTO items (id, kind, title, url, status, derived_v, created_at, updated_at)
        VALUES (?, 'link', ?, ?, 'pending', 0, ?, ?)`,
      params: [id, title, url, now, now],
    },
    {
      sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        primary.boardId,
        id,
        primary.rect.x,
        primary.rect.y,
        primary.rect.w,
        primary.rect.h,
        primary.z,
        now,
      ],
    },
  ];
  if (extra) {
    statements.push({
      sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        extra.boardId,
        id,
        extra.rect.x,
        extra.rect.y,
        extra.rect.w,
        extra.rect.h,
        extra.z,
        now,
      ],
    });
  }
  await platform.db.batch(statements);

  const item: Item = {
    id,
    kind: 'link',
    title,
    filePath: null,
    fileName: null,
    fileHash: null,
    fileSize: null,
    mime: null,
    width: null,
    height: null,
    artist: null,
    sourceUrl: null,
    why: null,
    palette: null,
    colorFamilies: null,
    phash: null,
    favorite: false,
    sortedAt: null,
    viewedAt: null,
    status: 'pending',
    derivedV: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    url,
    coverPath: null,
    linkMeta: null,
  };
  const placement: Placement = {
    boardId: primary.boardId,
    itemId: id,
    x: primary.rect.x,
    y: primary.rect.y,
    w: primary.rect.w,
    h: primary.rect.h,
    z: primary.z,
    frameId: null,
    addedAt: now,
  };
  useLibraryStore.getState().upsertItem(item);
  useLibraryStore.getState().upsertPlacement(placement);
  return id;
}

async function markLinkReady(platform: Platform, id: string): Promise<void> {
  const now = new Date().toISOString();
  await platform.db.execute(
    "UPDATE items SET status = 'ok', derived_v = ?, updated_at = ? WHERE id = ?",
    [CURRENT_DERIVED_V, now, id],
  );
  const current = useLibraryStore.getState().items.get(id);
  if (current) {
    useLibraryStore
      .getState()
      .upsertItem({ ...current, status: 'ok', derivedV: CURRENT_DERIVED_V, updatedAt: now });
  }
}

/** Fetches title/description/cover for a link that's still `pending` — called right after import,
 * and again at startup for any link that never got this far last time (§4.7 "resumable"). A
 * failed fetch (offline, blocked site, no `og:image`) still resolves to `status: 'ok'` with the
 * plain domain card (§2.3: "the card stays a clean domain card") rather than `unsupported`/
 * `error` — nothing about the link itself is actually broken. */
export async function enrichLink(platform: Platform, id: string, url: string): Promise<void> {
  const now = () => new Date().toISOString();
  try {
    const meta = await platform.net.linkMeta(url);
    const title = meta.title || meta.siteName || safeHostname(meta.finalUrl);
    await platform.db.execute(
      'UPDATE items SET title = ?, url = ?, link_meta = ?, updated_at = ? WHERE id = ?',
      [title, meta.finalUrl, JSON.stringify(meta), now(), id],
    );
    const current = useLibraryStore.getState().items.get(id);
    if (current) {
      useLibraryStore
        .getState()
        .upsertItem({ ...current, title, url: meta.finalUrl, linkMeta: meta, updatedAt: now() });
    }

    if (!meta.imageUrl) {
      await markLinkReady(platform, id);
      return;
    }
    const cover = await platform.media.importUrl(meta.imageUrl);
    await platform.db.execute(
      'UPDATE items SET cover_path = ?, mime = ?, updated_at = ? WHERE id = ?',
      [cover.relPath, cover.mime, now(), id],
    );
    const withCover = useLibraryStore.getState().items.get(id);
    if (withCover) {
      useLibraryStore
        .getState()
        .upsertItem({ ...withCover, coverPath: cover.relPath, mime: cover.mime, updatedAt: now() });
    }
    // The downloaded cover is just an image at this point — reuses the same Worker pool that
    // derives thumbnails/palette for every `image`-kind item, which also flips `status` to 'ok'.
    getIngestQueue(platform).enqueue([{ itemId: id, relPath: cover.relPath, mime: cover.mime }]);
  } catch (err) {
    logger.warn(`Link metadata fetch failed for ${id}`, err);
    await markLinkReady(platform, id);
  }
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop();
  return last || url.hostname;
}

/** §2.3 "Image URLs: if a pasted or dropped URL answers with image/*, download it and import it
 * as an image, with source_url set to that URL" — tried before creating a Link item, using
 * `looksLikeImageUrl` only to skip this attempt for obviously-not-an-image URLs (the real check
 * is Rust's own `Content-Type` check inside `net_download_image`, which this relies on by simply
 * trying the download and catching failure). Returns the new item id, or `null` if the URL isn't
 * a direct image (the caller falls back to creating a Link item). */
async function tryImportAsImage(
  platform: Platform,
  url: URL,
  primary: PlacementTarget,
  extra?: PlacementTarget,
): Promise<string | null> {
  if (!looksLikeImageUrl(url)) return null;
  try {
    const result = await platform.media.importUrl(url.toString());
    const id = await createRow(
      platform,
      primary,
      {
        kind: 'image',
        relPath: result.relPath,
        fileName: fileNameFromUrl(url),
        hash: result.hash,
        size: result.size,
        mime: result.mime,
      },
      extra,
    );
    const item = useLibraryStore.getState().items.get(id);
    if (item) useLibraryStore.getState().upsertItem({ ...item, sourceUrl: url.toString() });
    await platform.db.execute('UPDATE items SET source_url = ? WHERE id = ?', [url.toString(), id]);
    return id;
  } catch {
    return null;
  }
}

/** Creates a Link item at `dropPoint` (§2.3's Add menu "Link…", paste, and drag-and-drop entry
 * points all funnel through here) — or, when the URL itself answers with an image, an Image item
 * instead (§2.3's "Image URLs" rule). Unless Offline mode is on, kicks off metadata/cover fetch in
 * the background for the Link case — the item appears immediately as a plain domain card and
 * sharpens once that finishes, the same "placeholder then sharpen" feel as every other kind. */
export async function importLink(
  platform: Platform,
  rawUrl: string,
  dropPoint: DropPoint,
  offline: boolean,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    useToastStore.getState().show(en.link.invalidUrl);
    return;
  }

  const plan = await planBatchPlacements(platform, dropPoint, 1);
  const primary = {
    boardId: plan.primaryBoardId,
    rect: plan.primaryRects[0],
    z: plan.primaryZStart,
  };
  const extra = plan.extraBoardId
    ? { boardId: plan.extraBoardId, rect: plan.extraRects[0], z: plan.extraZStart }
    : undefined;

  if (!offline && platform.net.enabled()) {
    const imageId = await tryImportAsImage(platform, url, primary, extra);
    if (imageId) {
      await finishBatch(platform, [imageId]);
      return;
    }
  }

  const id = await createLinkRow(platform, primary, url.toString(), extra);
  await finishBatch(platform, [id]);

  if (offline || !platform.net.enabled()) {
    await markLinkReady(platform, id);
    return;
  }
  void enrichLink(platform, id, url.toString());
}

interface PendingLinkRow extends DbRow {
  id: string;
  url: string | null;
}

/** Re-runs the whole metadata/cover fetch for any link left `pending` by a previous run (crash,
 * force-quit mid-fetch) — `enrichLink` is idempotent (a fresh fetch just overwrites the same
 * fields), so this doesn't need to distinguish "metadata never fetched" from "metadata fetched,
 * cover ingest interrupted." */
export async function resumePendingLinkIngest(platform: Platform): Promise<void> {
  const rows = await platform.db.select<PendingLinkRow>(
    `SELECT id, url FROM items WHERE kind = 'link' AND deleted_at IS NULL AND status = 'pending'`,
  );
  for (const row of rows) {
    if (row.url) void enrichLink(platform, row.id, row.url);
  }
}
