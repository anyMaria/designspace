import * as fontkit from 'fontkit';
import { colors, fonts } from '@/design/tokens';

/** Metadata + specimen-card rendering for font items (§2.4, §4.9). Unlike video/PDF, a font's
 * card is a fixed dark design ("large 'Aa' in the font, the family name, one sample line") rather
 * than a derived photo, so there's no palette/color-family extraction here — the card's tint is
 * always `colors.surface2` (already `itemCards.ts`'s `FALLBACK_COLOR`, so no special-casing is
 * needed there either). Parsing (`fontkit.create`) needs no DOM and could run in a Worker, but
 * rendering the specimen does (`FontFace` + canvas `fillText`), so — like video/PDF — this all
 * runs on the main thread for one straightforward pipeline. */

const SPECIMEN_W = 512;
const SPECIMEN_H = 320; // 320 × 200 card aspect (§2.4's Font row), doubled for T512
/** The font card's shape; ingest reshapes the 320×320 placeholder to it (Patch 1 · A4). */
export const SPECIMEN_ASPECT = SPECIMEN_W / SPECIMEN_H;
const THUMB_W = 128;
const THUMB_H = 80;
const WEBP_QUALITY = 0.82;
const SAMPLE_TEXT = 'Sphinx of black quartz, judge my vow';

export interface FontVariationAxis {
  tag: string;
  name: string;
  min: number;
  max: number;
  default: number;
}

export interface FontMeta {
  family: string;
  subfamily: string;
  fullName: string;
  designer: string | null;
  manufacturer: string | null;
  license: string | null;
  glyphCount: number;
  variableAxes: FontVariationAxis[];
}

export interface FontDerivatives extends FontMeta {
  t128: ArrayBuffer;
  t512: ArrayBuffer;
}

function toHexColor(packed: number): string {
  return `#${packed.toString(16).padStart(6, '0')}`;
}

function parseFont(bytes: ArrayBuffer): fontkit.Font {
  // @types/fontkit's `create()` is typed against fontkit's Node API (`Buffer`), which the
  // browser build doesn't actually need (verified in the S6 spike, docs/DECISIONS.md) — cast
  // through `unknown` rather than pull in a `buffer` polyfill just to satisfy a stale type.
  const parsed = fontkit.create(new Uint8Array(bytes) as unknown as Buffer);
  return 'fonts' in parsed ? parsed.fonts[0] : parsed;
}

function readMeta(font: fontkit.Font): FontMeta {
  const variableAxes = Object.entries(font.variationAxes)
    .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] != null)
    .map(([tag, axis]) => ({
      tag,
      name: axis.name,
      min: axis.min,
      max: axis.max,
      default: axis.default,
    }));
  return {
    family: font.familyName || 'Untitled',
    subfamily: font.subfamilyName || '',
    fullName: font.fullName || font.familyName || 'Untitled',
    designer: font.getName('designer', 'en') || null,
    manufacturer: font.getName('manufacturer', 'en') || null,
    license: font.getName('license', 'en') || null,
    glyphCount: font.numGlyphs,
    variableAxes,
  };
}

function drawSpecimen(
  localFamily: string,
  meta: FontMeta,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const scale = w / SPECIMEN_W;
  ctx.fillStyle = toHexColor(colors.surface2);
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = toHexColor(colors.text1);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(160 * scale)}px "${localFamily}"`;
  ctx.fillText('Aa', 24 * scale, 180 * scale);

  ctx.font = `600 ${Math.round(24 * scale)}px ${fonts.ui}`;
  ctx.fillStyle = toHexColor(colors.text1);
  ctx.fillText(meta.family, 24 * scale, 230 * scale, w - 48 * scale);

  ctx.font = `${Math.round(16 * scale)}px "${localFamily}"`;
  ctx.fillStyle = toHexColor(colors.text2);
  ctx.fillText(SAMPLE_TEXT, 24 * scale, 270 * scale, w - 48 * scale);

  return canvas;
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        void blob.arrayBuffer().then(resolve, reject);
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

/** Registers `bytes` as a temporary, uniquely-named `FontFace` — `localFamily` should be an
 * internal id (e.g. the item id), not the font's own family name, so two different fonts that
 * happen to share a family name (or the same font imported twice) never collide in
 * `document.fonts`. Callers must eventually call the returned face's removal via
 * `document.fonts.delete`. */
export async function registerFontFace(bytes: ArrayBuffer, localFamily: string): Promise<FontFace> {
  const face = new FontFace(localFamily, bytes);
  await face.load();
  document.fonts.add(face);
  return face;
}

/** Parses metadata and renders the specimen card (two thumbnail sizes) for a font item. Rejects
 * for anything fontkit/`FontFace` can't parse, which callers should map to `status: 'unsupported'`
 * rather than retrying. `localFamily` is the same internal id `registerFontFace` needs. */
export async function extractFontDerivatives(
  bytes: ArrayBuffer,
  localFamily: string,
): Promise<FontDerivatives> {
  const font = parseFont(bytes);
  const meta = readMeta(font);
  const face = await registerFontFace(bytes, localFamily);
  try {
    // The specimen's family-name line is drawn in the UI font; make sure it is ready.
    await document.fonts.load(`600 24px ${fonts.ui}`).catch(() => []);
    const [t128, t512] = await Promise.all([
      canvasToWebp(drawSpecimen(localFamily, meta, THUMB_W, THUMB_H)),
      canvasToWebp(drawSpecimen(localFamily, meta, SPECIMEN_W, SPECIMEN_H)),
    ]);
    return { ...meta, t128, t512 };
  } finally {
    document.fonts.delete(face);
  }
}
