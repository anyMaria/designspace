import { useEffect } from 'react';
import { useUiStore } from '@/state/uiStore';
import { prefersReducedMotion } from './motion';

/** Keeps `<html data-reduce-motion>` in sync with the effective reduce-motion state (§2.14's
 * System/On/Off setting resolved against the OS `prefers-reduced-motion` media query) — the CSS
 * `--duration-*` tokens key off this attribute (`tokens.css`) so purely-CSS transitions (hover,
 * panel open/close, overlay fade) respect the same setting as the JS-driven camera/Constellations
 * animations, which already call `prefersReducedMotion()` directly. Re-syncs whenever the app
 * setting changes or the OS-level preference changes live (only matters while the setting is
 * "System"). Mount once, near the app root. */
export function useReducedMotionSync(): void {
  const reduceMotion = useUiStore((s) => s.reduceMotion);

  useEffect(() => {
    function sync(): void {
      document.documentElement.dataset.reduceMotion = prefersReducedMotion() ? 'true' : 'false';
    }
    sync();

    if (reduceMotion !== 'system') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [reduceMotion]);
}
