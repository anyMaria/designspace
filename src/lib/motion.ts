import { useUiStore } from '@/state/uiStore';

/** Settings → Canvas's reduce-motion override (System/On/Off, §2.14, §3.3): "System" defers to
 * the OS `prefers-reduced-motion` media query; "On"/"Off" force it either way. */
export function prefersReducedMotion(): boolean {
  const setting = useUiStore.getState().reduceMotion;
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Shared ease-in-out curve for every eased animation in the app (camera flights, the
 * Constellations morph) — one formula so they all feel the same. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
