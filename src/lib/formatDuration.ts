/** Formats milliseconds as `m:ss` — shared by the canvas video badge and the Details panel's Info
 * row so a clip's duration reads identically everywhere it appears. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
