/** v1 supported file kinds (§2.3). Link import (paste/drop a URL) is handled separately — it has
 * no file extension to detect. Logged in docs/DECISIONS.md. */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'm4v', 'mov'];
export const PDF_EXTENSIONS = ['pdf'];
export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];
export const ALL_SUPPORTED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...FONT_EXTENSIONS,
];

const IMAGE_SET = new Set(IMAGE_EXTENSIONS);
const VIDEO_SET = new Set(VIDEO_EXTENSIONS);
const PDF_SET = new Set(PDF_EXTENSIONS);
const FONT_SET = new Set(FONT_EXTENSIONS);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isSupportedImage(name: string): boolean {
  return IMAGE_SET.has(extensionOf(name));
}

export function isSupportedVideo(name: string): boolean {
  return VIDEO_SET.has(extensionOf(name));
}

export function isSupportedPdf(name: string): boolean {
  return PDF_SET.has(extensionOf(name));
}

export function isSupportedFont(name: string): boolean {
  return FONT_SET.has(extensionOf(name));
}

/** `null` for anything none of the above — the "Designspace can't add .xyz files yet." case. */
export function detectMediaKind(name: string): 'image' | 'video' | 'pdf' | 'font' | null {
  if (isSupportedImage(name)) return 'image';
  if (isSupportedVideo(name)) return 'video';
  if (isSupportedPdf(name)) return 'pdf';
  if (isSupportedFont(name)) return 'font';
  return null;
}
