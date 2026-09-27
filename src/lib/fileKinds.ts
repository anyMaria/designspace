/** v1 supported file kinds (§2.3). M1 only ships an ingest pipeline and card for images — video,
 * PDF and font import lands with the milestones that add their worker/card/Focus view. Logged in
 * docs/DECISIONS.md. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg']);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isSupportedImage(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}
