/** Settings → Canvas has a reduce-motion override (System/On/Off, §3.3); until that section
 * lands (M1-9) this just reads the OS preference directly. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
