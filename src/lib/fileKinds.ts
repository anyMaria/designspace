/** v1 supported file kinds (§2.3). Link import (paste/drop a URL) is handled separately — it has
 * no file extension to detect. Logged in docs/DECISIONS.md. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'm4v', 'mov']);
const PDF_EXTENSIONS = new Set(['pdf']);
const FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2']);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isSupportedImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

export function isSupportedVideo(name: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(name));
}

export function isSupportedPdf(name: string): boolean {
  return PDF_EXTENSIONS.has(extensionOf(name));
}

export function isSupportedFont(name: string): boolean {
  return FONT_EXTENSIONS.has(extensionOf(name));
}

/** `null` for anything none of the above — the "Designspace can't add .xyz files yet." case. */
export function detectMediaKind(name: string): 'image' | 'video' | 'pdf' | 'font' | null {
  if (isSupportedImage(name)) return 'image';
  if (isSupportedVideo(name)) return 'video';
  if (isSupportedPdf(name)) return 'pdf';
  if (isSupportedFont(name)) return 'font';
  return null;
}
