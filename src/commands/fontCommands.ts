import type { DbStatement, Platform } from '@/platform/types';
import type { FontMeta } from '@/lib/fontRender';
import type { FontCardOptions, FontFile } from '@/state/types';
import { useFontFilesStore } from '@/state/fontFilesStore';
import { useLibraryStore } from '@/state/libraryStore';
import { getFontIngestQueue } from '@/workers/fontIngestQueue';
import { newId } from '@/lib/ids';
import type { Command } from './types';

/** What `importItems` knows about a copied font file before it becomes a `font_files` row. */
export interface NewFontFile {
  filePath: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  mime: string;
  /** null when the file could not be read (it is then marked unsupported by the queue). */
  meta: FontMeta | null;
}

/** Upright styles first, lighter before heavier (the order of the Styles list). */
export function sortNewFontFiles(files: NewFontFile[]): NewFontFile[] {
  return [...files].sort(
    (a, b) =>
      Number(a.meta?.italic ?? false) - Number(b.meta?.italic ?? false) ||
      (a.meta?.weight ?? 400) - (b.meta?.weight ?? 400) ||
      (a.meta?.styleName ?? '').localeCompare(b.meta?.styleName ?? ''),
  );
}

export function makeFontFile(itemId: string, f: NewFontFile, sort: number, now: string): FontFile {
  return {
    id: newId(),
    itemId,
    filePath: f.filePath,
    fileName: f.fileName,
    fileHash: f.fileHash,
    fileSize: f.fileSize,
    mime: f.mime,
    styleName: f.meta?.styleName ?? '',
    weight: f.meta?.weight ?? 400,
    italic: f.meta?.italic ?? false,
    axes: f.meta && f.meta.variableAxes.length > 0 ? f.meta.variableAxes : null,
    instances: f.meta?.instances ?? null,
    sort,
    status: 'ok',
    createdAt: now,
    deletedAt: null,
  };
}

export function insertFontFileStatement(file: FontFile, meta: FontMeta | null): DbStatement {
  return {
    sql: `INSERT INTO font_files
      (id, item_id, file_path, file_name, file_hash, file_size, mime, style_name, weight, italic,
       axes, instances, meta, sort, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      file.id,
      file.itemId,
      file.filePath,
      file.fileName,
      file.fileHash,
      file.fileSize,
      file.mime,
      file.styleName,
      file.weight,
      file.italic ? 1 : 0,
      file.axes ? JSON.stringify(file.axes) : null,
      file.instances ? JSON.stringify(file.instances) : null,
      meta ? JSON.stringify(meta) : null,
      file.sort,
      file.status,
      file.createdAt,
    ],
  };
}

function requeue(platform: Platform, itemId: string): void {
  getFontIngestQueue(platform).enqueue([{ itemId }]);
}

/** Adds font files to an existing family (Patch 2 · F3). Undo marks them deleted, so the copied
 * files are cleaned up by the Trash purge like any other. The family's specimen is re-made. */
export function createAddFontFilesCommand(
  platform: Platform,
  itemId: string,
  files: NewFontFile[],
): Command {
  let added: FontFile[] = [];
  return {
    label: 'Add fonts to family',
    do: async () => {
      const store = useFontFilesStore.getState();
      const now = new Date().toISOString();
      if (added.length === 0) {
        let sort = store.forItem(itemId).length;
        added = sortNewFontFiles(files).map((f) => makeFontFile(itemId, f, sort++, now));
      }
      const byPath = new Map(files.map((f) => [f.filePath, f.meta]));
      await platform.db.batch(
        added.map((f) => insertFontFileStatement(f, byPath.get(f.filePath) ?? null)),
      );
      for (const f of added) store.upsert(f);
      requeue(platform, itemId);
    },
    undo: async () => {
      const now = new Date().toISOString();
      await platform.db.batch(
        added.map((f) => ({
          sql: 'UPDATE font_files SET deleted_at = ? WHERE id = ?',
          params: [now, f.id],
        })),
      );
      for (const f of added) useFontFilesStore.getState().remove(itemId, f.id);
      requeue(platform, itemId);
    },
  };
}

/** What the card of a family shows (Patch 2 · F4). One undo step; the specimen is re-made after
 * `do` and `undo` (derived data). */
export function createSetFontCardCommand(
  platform: Platform,
  itemId: string,
  next: FontCardOptions,
): Command {
  let previous: FontCardOptions | null | undefined;

  async function apply(card: FontCardOptions | null): Promise<void> {
    const store = useLibraryStore.getState();
    const item = store.items.get(itemId);
    if (item) store.upsertItem({ ...item, fontCard: card });
    await platform.db.execute('UPDATE items SET font_card = ?, updated_at = ? WHERE id = ?', [
      card ? JSON.stringify(card) : null,
      new Date().toISOString(),
      itemId,
    ]);
    requeue(platform, itemId);
  }

  return {
    label: 'Change what the card shows',
    do: async () => {
      if (previous === undefined)
        previous = useLibraryStore.getState().items.get(itemId)?.fontCard ?? null;
      await apply(next);
    },
    undo: () => apply(previous ?? null),
  };
}
