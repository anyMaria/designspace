import type { DbRow, ImportResult, Platform } from '@/platform/types';
import { IMAGE_EXTENSIONS } from '@/lib/fileKinds';
import { useHistoryStore } from '@/commands/history';
import { createSetLinkCoverCommand } from '@/commands/linkCoverCommands';
import { useLibraryStore } from '@/state/libraryStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useToastStore } from '@/state/toastStore';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';
import { enrichLink, LINK_FETCHER_V } from './importLink';

/** Adding or replacing a link's picture by hand (Patch 3 · B3): from a file, the clipboard, a
 * dropped file, or by asking the network again. Every path ends in one undoable command. */

async function applyCover(
  platform: Platform,
  itemId: string,
  imported: ImportResult,
): Promise<void> {
  await useHistoryStore.getState().execute(createSetLinkCoverCommand(platform, itemId, imported));
}

function failed(err: unknown): void {
  logger.warn('Setting the link picture failed', err);
  useToastStore.getState().show(en.link.pictureFailed);
}

/** A picture file dropped on the picture box, or chosen in the browser build. */
export async function setLinkPictureFromFile(
  platform: Platform,
  itemId: string,
  file: File,
): Promise<void> {
  if (!file.type.startsWith('image/')) {
    failed(new Error(`Not a picture: ${file.type}`));
    return;
  }
  try {
    await applyCover(platform, itemId, await platform.media.importFile(file));
  } catch (err) {
    failed(err);
  }
}

/** Asks for a picture: the file dialog on the desktop app, a file input in the browser build. */
export async function chooseLinkPicture(platform: Platform, itemId: string): Promise<void> {
  try {
    if (platform.kind === 'tauri') {
      const paths = await platform.dialogs.openFiles([
        { name: en.addMenu.filterImages, extensions: IMAGE_EXTENSIONS },
      ]);
      if (paths.length === 0) return;
      const [imported] = await platform.media.importPaths([paths[0]]);
      if (imported) await applyCover(platform, itemId, imported);
      return;
    }
    const file = await pickFileInBrowser();
    if (file) await setLinkPictureFromFile(platform, itemId, file);
  } catch (err) {
    failed(err);
  }
}

function pickFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function pasteLinkPicture(platform: Platform, itemId: string): Promise<void> {
  try {
    const bytes = await platform.clipboard.readImage();
    if (!bytes) {
      useToastStore.getState().show(en.colorStudio.nothingToPaste);
      return;
    }
    await applyCover(
      platform,
      itemId,
      await platform.media.importBytes(`pasted-${Date.now()}.png`, bytes),
    );
  } catch (err) {
    failed(err);
  }
}

/** Whether "Try again" can do anything: the network is allowed and Offline mode is off. */
export function canFetchLinks(platform: Platform): boolean {
  return platform.net.enabled() && !useSettingsStore.getState().offlineMode;
}

export async function tryLinkAgain(platform: Platform, itemId: string): Promise<void> {
  const item = useLibraryStore.getState().items.get(itemId);
  if (!item?.url || !canFetchLinks(platform)) return;
  await enrichLink(platform, itemId, item.url);
}

const LOOK_PARALLEL = 3;

interface LinkRow extends DbRow {
  id: string;
  url: string | null;
  link_meta: string | null;
}

/** Links with no picture that the old fetcher read (or that were never read): worth another look. */
export async function findLinksNeedingPictures(
  platform: Platform,
): Promise<{ id: string; url: string }[]> {
  const rows = await platform.db.select<LinkRow>(
    `SELECT id, url, link_meta FROM items
     WHERE kind = 'link' AND deleted_at IS NULL AND status = 'ok' AND cover_path IS NULL
       AND url IS NOT NULL`,
  );
  const found: { id: string; url: string }[] = [];
  for (const row of rows) {
    let fetcherV = 0;
    try {
      const meta = row.link_meta ? (JSON.parse(row.link_meta) as { fetcherV?: unknown }) : null;
      if (typeof meta?.fetcherV === 'number') fetcherV = meta.fetcherV;
    } catch {
      // unreadable link_meta: treat as never fetched
    }
    if (fetcherV < LINK_FETCHER_V && row.url) found.push({ id: row.id, url: row.url });
  }
  return found;
}

/** Looks for the pictures of these links, three at a time. */
export async function lookForPictures(
  platform: Platform,
  links: { id: string; url: string }[],
): Promise<void> {
  const queue = [...links];
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await enrichLink(platform, next.id, next.url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOOK_PARALLEL, queue.length) }, worker));
}

/** At start-up (Patch 3 · P7): asks once, never fetches on its own. */
export async function offerLinkPictureLookup(platform: Platform): Promise<void> {
  if (!canFetchLinks(platform)) return;
  const links = await findLinksNeedingPictures(platform);
  if (links.length === 0) return;
  useToastStore.getState().show(en.link.findPictures(links.length), {
    actionLabel: en.link.lookForPictures,
    onAction: () => void lookForPictures(platform, links),
    duration: 15000,
  });
}
