/** Recognizes "this looks like one URL, and only a URL" for paste/drop (§2.3) — deliberately
 * strict (the whole trimmed string must parse as an http(s) URL) so pasting a sentence that
 * happens to contain a link still becomes a note, not a Link item. */
export function parseHttpUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const IMAGE_URL_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

/** §2.3 "Image URLs: if a pasted or dropped URL answers with image/*, download it and import it
 * as an image" — this is only a fast-path hint (skip a redirect+HTML round trip when the
 * extension already gives it away); the authoritative check is still the response's real
 * `Content-Type`, made server-side by Rust's `net_download_image` (§4.4's network limits). */
export function looksLikeImageUrl(url: URL): boolean {
  const last = url.pathname.split('/').pop() ?? '';
  const ext = last.includes('.') ? last.split('.').pop()!.toLowerCase() : '';
  return IMAGE_URL_EXTENSIONS.has(ext);
}
