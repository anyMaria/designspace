/** Domain types shared by the stores, commands and canvas — mirrors the `items`/`placements`
 * columns from §5.2. M1 only deals with the `image` kind; the rest of the union lands with the
 * milestones that add them (videos/PDFs/fonts in M5, links in M5, notes/swatches in M4). */

import type { FontMeta } from '@/lib/fontRender';
import type { LinkMeta } from '@/platform/types';

export type ItemKind = 'image' | 'video' | 'pdf' | 'font' | 'link' | 'note' | 'swatch';
export type ItemStatus = 'pending' | 'ok' | 'unsupported' | 'error';

export interface PaletteEntry {
  hex: string;
  weight: number;
}

/** One colour of a swatch or palette (Patch 1 · C). */
export interface SwatchColor {
  hex: string;
  name?: string;
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
  /** §2.11 Notes/Swatches (M4). `body` is a note's TipTap document (`JSONContent`, untyped here
   * to avoid a `@tiptap/core` import in the shared types module); `bodyText` is its plain-text
   * extraction, kept in sync for search. `color` is a note color token (see `design/tokens.ts`'s
   * `noteColors`) or a swatch's hex. `originBoardId` non-null means "board-only" — doesn't show
   * in the Library (§5.2's `origin_board_id`). Optional (rather than `| null` required) so every
   * `image`-kind `Item` literal from before M4 doesn't need updating — treat a missing value the
   * same as `null`. */
  body?: unknown;
  bodyText?: string | null;
  /** Patch 1 (migration 002): a swatch/palette's colours, a note-format long description with its
   * plain text for search, and the thumbnail version (bumped when t128/t512 are rewritten). */
  swatchColors?: SwatchColor[] | null;
  description?: unknown;
  descriptionText?: string | null;
  thumbV?: number;
  color?: string | null;
  originBoardId?: string | null;
  /** §2.4/§5.2 video fields (M5). `durationMs` is the whole clip; `posterMs` is the cover-frame
   * timestamp — automatic on import, changeable via "Set cover frame". Optional for the same
   * pre-M5 `Item`-literal reason `body`/`color` above are. */
  durationMs?: number | null;
  posterMs?: number | null;
  /** §2.4/§5.2 PDF fields (M5). `pageCount` is the document's total page count; `coverPage` is the
   * 1-based page rendered as the thumbnail — automatic (page 1) on import, changeable via "Set as
   * cover". Optional for the same pre-M5 `Item`-literal reason as the video fields above. */
  pageCount?: number | null;
  coverPage?: number | null;
  /** §2.4/§5.2 font metadata (M5) — parsed once at ingest (`lib/fontRender.ts`) and never
   * recomputed, unlike video/PDF's re-derivable cover frame/page. Optional for the same pre-M5
   * `Item`-literal reason as the video/PDF fields above. */
  fontMeta?: FontMeta | null;
  /** §2.4/§5.2 link fields (M5). `url` is the link's target (redirect-resolved, once metadata
   * fetch finishes); `coverPath` is the downloaded `og:image`, relative to the library root, like
   * `filePath` for every other kind but kept as its own column since a link's "original" is the
   * webpage, not a local file — `filePath` stays null for links (nothing to reveal in Explorer or
   * send to the Recycle Bin). `linkMeta` is the raw fetched metadata (title/description/siteName/
   * faviconUrl), kept even after `title` is copied onto the item's own field so the Focus view can
   * show description/site name too. Optional for the same pre-M5 `Item`-literal reason as the
   * other M5 kind-specific fields above. */
  url?: string | null;
  coverPath?: string | null;
  linkMeta?: LinkMeta | null;
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
  /** Crop focus (0–1, like CSS `object-position` under `object-fit: cover`); null = not cropped
   * by the owner (Patch 2 · C3). */
  cropX: number | null;
  cropY: number | null;
  addedAt: string;
}

/** §2.11 "Frames on any space" — a labeled grouping rectangle on a board (or the Library map).
 * Dragging a frame by its title moves every placement whose `frameId` points at it along with it
 * (§4.9); items aren't otherwise clipped or reparented by overlapping a frame's rect. */
export interface Frame {
  id: string;
  boardId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  createdAt: string;
  updatedAt: string;
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

/** §2.11 Boards — one row per space; the single `kind: 'library'` row is the Library map itself
 * (created by `ensureLibraryReady`), every other row is a moodboard. */
export type BoardKind = 'library' | 'board';

export interface BoardCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  id: string;
  kind: BoardKind;
  name: string;
  sourceFilter: unknown;
  settings: Record<string, unknown> | null;
  camera: BoardCamera | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** §2.10 "My connections" — manual, undirected in the UI but stored as an ordered pair so the
 * `UNIQUE (from_id, to_id)` constraint can't be defeated by adding the same pair in reverse (the
 * commands always normalize the order before writing — see `commands/connectionCommands.ts`). */
export interface ManualConnection {
  id: string;
  fromId: string;
  toId: string;
  label: string | null;
  createdAt: string;
}
