import { swatchColorsOf } from '@/lib/palette';
import type { Item, Placement } from '@/state/types';
import type { Platform } from '@/platform/types';
import type { ItemCard } from './Engine';
import { noteColors, type NoteColor } from '@/design/tokens';
import { noteBodyToTaggedText } from '@/lib/noteTagged';
import { en } from '@/i18n/en';

const FALLBACK_COLOR = 0x33203d; // --surface-2, used until a palette exists
const DEFAULT_NOTE_COLOR: NoteColor = 'cream';

function hexToInt(hex: string): number {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(parsed) ? FALLBACK_COLOR : parsed;
}

function safeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Maps a library Item + its Placement to the canvas engine's `ItemCard` — §4.6. Thumbnails
 * are only requested once ingest has produced them (`status === 'ok'`); before that the card
 * shows as a flat tinted placeholder (§2.3 "Items appear at once as placeholders tinted with
 * their dominant color, then sharpen"). Notes (§2.11) never get a thumbnail — they're always
 * a flat color card (their own `color` token) with a plain-text snippet the engine draws as a
 * `Text` child (see `Engine.setLibraryItems`'s note-label handling and Spike S4 in DECISIONS.md
 * for why that's a plain-text snippet rather than a full `HTMLText` render of the rich content). */
export function itemToCard(item: Item, placement: Placement, platform: Platform): ItemCard {
  if (item.kind === 'note') {
    const colorName = (item.color as NoteColor | null) ?? DEFAULT_NOTE_COLOR;
    const dominantColor = noteColors[colorName] ?? noteColors[DEFAULT_NOTE_COLOR];
    return {
      id: item.id,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: placement.z,
      kind: 'note',
      dominantColor,
      thumbUrl128: null,
      thumbUrl512: null,
      noteText: noteBodyToTaggedText(item.body),
      frameId: placement.frameId,
      durationMs: null,
      videoUrl: null,
      pageCount: null,
      swatchColors: null,
      swatchName: null,
      noteColor: colorName,
    };
  }

  if (item.kind === 'swatch') {
    const colors = swatchColorsOf(item).map((c) => c.hex);
    return {
      id: item.id,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: placement.z,
      kind: 'swatch',
      dominantColor: hexToInt(colors[0]),
      thumbUrl128: null,
      thumbUrl512: null,
      noteText: null, // drawn by decor/paletteDecor.ts, not as a text label
      frameId: placement.frameId,
      durationMs: null,
      videoUrl: null,
      pageCount: null,
      swatchColors: colors,
      swatchName: item.title.trim() || null,
      noteColor: null,
    };
  }

  if (item.kind === 'link') {
    const hasCover = !!item.coverPath;
    const dominantColor = item.palette?.[0]?.hex ? hexToInt(item.palette[0].hex) : FALLBACK_COLOR;
    const thumbReady = item.status === 'ok' && hasCover;
    return {
      id: item.id,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      z: placement.z,
      kind: 'link',
      dominantColor,
      thumbUrl128: thumbReady ? platform.cache.url(`t128/${item.id}`) : null,
      thumbUrl512: thumbReady ? platform.cache.url(`t512/${item.id}`) : null,
      // "Preview image (or custom cover) + footer: favicon · domain · 2-line title" (§2.4's spec
      // table) — a plain-text approximation (domain + title, no favicon glyph) reusing the same
      // Text-overlay machinery as the note/swatch/unsupported-fallback labels, shown until the
      // cover is ready (also while it loads or if it failed; the "clean domain card" case, §2.3).
      noteText: thumbReady
        ? null
        : [safeDomain(item.url), item.title || null].filter(Boolean).join('\n'),
      frameId: placement.frameId,
      durationMs: null,
      videoUrl: null,
      pageCount: null,
      swatchColors: null,
      swatchName: null,
      noteColor: null,
    };
  }

  const dominantColor = item.palette?.[0]?.hex ? hexToInt(item.palette[0].hex) : FALLBACK_COLOR;
  const ready = item.status === 'ok';
  const unsupported = item.status === 'unsupported';
  // Reuses the note/swatch label's Text-overlay machinery for a video whose codec/container
  // `<video>` couldn't decode, a PDF pdf.js couldn't parse, or a font fontkit/`FontFace` couldn't
  // read (§2.4's fallback tile) rather than leaving it an indefinite placeholder that looks like
  // it's still loading.
  const fallbackText = !unsupported
    ? null
    : item.kind === 'video'
      ? en.video.unsupportedFallback
      : item.kind === 'pdf'
        ? en.pdf.unsupportedFallback
        : item.kind === 'font'
          ? en.font.unsupportedFallback
          : null;
  return {
    id: item.id,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    z: placement.z,
    kind: item.kind,
    dominantColor,
    thumbUrl128: ready ? platform.cache.url(`t128/${item.id}`) : null,
    thumbUrl512: ready ? platform.cache.url(`t512/${item.id}`) : null,
    noteText: fallbackText,
    frameId: placement.frameId,
    durationMs: item.kind === 'video' ? (item.durationMs ?? null) : null,
    videoUrl:
      item.kind === 'video' && item.filePath ? platform.media.originalUrl(item.filePath) : null,
    pageCount: item.kind === 'pdf' ? (item.pageCount ?? null) : null,
    swatchColors: null,
    swatchName: null,
    noteColor: null,
  };
}
