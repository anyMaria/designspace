import { create } from 'zustand';
import type { FontFile } from '@/state/types';

/** The files of every font family, by item id, sorted by `sort` (Patch 2 · F1). */
interface FontFilesState {
  files: Map<string, FontFile[]>;
  loadAll: (rows: FontFile[]) => void;
  upsert: (file: FontFile) => void;
  remove: (itemId: string, fileId: string) => void;
  forItem: (itemId: string) => FontFile[];
}

function group(rows: FontFile[]): Map<string, FontFile[]> {
  const map = new Map<string, FontFile[]>();
  for (const r of rows) {
    if (r.deletedAt) continue;
    const list = map.get(r.itemId) ?? [];
    list.push(r);
    map.set(r.itemId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort - b.sort);
  return map;
}

export const useFontFilesStore = create<FontFilesState>((set, get) => ({
  files: new Map(),
  loadAll: (rows) => set({ files: group(rows) }),
  upsert: (file) =>
    set((s) => {
      const list = (s.files.get(file.itemId) ?? []).filter((f) => f.id !== file.id);
      if (!file.deletedAt) list.push(file);
      list.sort((a, b) => a.sort - b.sort);
      const files = new Map(s.files);
      if (list.length > 0) files.set(file.itemId, list);
      else files.delete(file.itemId);
      return { files };
    }),
  remove: (itemId, fileId) =>
    set((s) => {
      const list = (s.files.get(itemId) ?? []).filter((f) => f.id !== fileId);
      const files = new Map(s.files);
      if (list.length > 0) files.set(itemId, list);
      else files.delete(itemId);
      return { files };
    }),
  forItem: (itemId) => get().files.get(itemId) ?? [],
}));
