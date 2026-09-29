type TauriLogModule = typeof import('@tauri-apps/plugin-log');

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Loaded once, lazily, only under Tauri — the browser dev build never imports this package at
// all, matching how the rest of the app keeps Tauri-only code out of that bundle (§4.5).
let tauriLog: TauriLogModule | null = null;
if (isTauri) {
  void import('@tauri-apps/plugin-log').then((mod) => {
    tauriLog = mod;
  });
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/** Routes to the browser console always (dev visibility) and, under Tauri, also to
 * `tauri-plugin-log`'s file target (§5.1's "Per-machine data... logs\") — Settings → About's
 * "Open logs folder" (M7-2) opens exactly that directory. A log call made before the plugin
 * finishes its one-time lazy import is console-only; every call after that point reaches the
 * file too. */
export const logger = {
  debug: (...args: unknown[]) => {
    console.debug('[designspace]', ...args);
    void tauriLog?.debug(formatArgs(args));
  },
  info: (...args: unknown[]) => {
    console.info('[designspace]', ...args);
    void tauriLog?.info(formatArgs(args));
  },
  warn: (...args: unknown[]) => {
    console.warn('[designspace]', ...args);
    void tauriLog?.warn(formatArgs(args));
  },
  error: (...args: unknown[]) => {
    console.error('[designspace]', ...args);
    void tauriLog?.error(formatArgs(args));
  },
};
