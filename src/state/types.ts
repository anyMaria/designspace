/** Domain types shared by the stores, commands and canvas — mirrors the `items`/`placements`
 * columns from §5.2. M1 only deals with the `image` kind; the rest of the union lands with the
 * milestones that add them (videos/PDFs/fonts in M5, links in M5, notes/swatches in M4). */

export type ItemKind = 'image' | 'video' | 'pdf' | 'font' | 'link' | 'note' | 'swatch';
export type ItemStatus = 'pending' | 'ok' | 'unsupported' | 'error';

export interface PaletteEntry {
  hex: string;
  weight: number;
}

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  filePath: string | null;
  fileName: string | null;
  fileHash: string | null;
  fileSize: number | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  artist: string | null;
  sourceUrl: string | null;
  why: string | null;
  palette: PaletteEntry[] | null;
  colorFamilies: string[] | null;
  phash: string | null;
  favorite: boolean;
  sortedAt: string | null;
  viewedAt: string | null;
  status: ItemStatus;
  derivedV: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Placement {
  boardId: string;
  itemId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  frameId: string | null;
  addedAt: string;
}

/** §2.5 classification vocabulary — one row per Type/Vibe/Movement/Tag value. */
export type Facet = 'type' | 'vibe' | 'movement' | 'tag';

export interface Term {
  id: string;
  facet: Facet;
  name: string;
  nameNorm: string;
  aiHint: string | null;
  sort: number;
  createdAt: string;
}

export type TermVia = 'user' | 'ai';

export interface ItemTerm {
  itemId: string;
  termId: string;
  via: TermVia;
  addedAt: string;
}
