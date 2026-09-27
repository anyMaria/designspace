/** Thin console wrapper so we have one place to route to tauri-plugin-log later (M0 keeps it local). */
export const logger = {
  debug: (...args: unknown[]) => console.debug('[designspace]', ...args),
  info: (...args: unknown[]) => console.info('[designspace]', ...args),
  warn: (...args: unknown[]) => console.warn('[designspace]', ...args),
  error: (...args: unknown[]) => console.error('[designspace]', ...args),
};
