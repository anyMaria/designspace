import type { Platform } from './types';

/** Picked once at startup — see §4.5. Everything else imports `platform` from here, never the
 * concrete Tauri/Browser classes, so features stay platform-agnostic. */
let instance: Platform | null = null;

export async function getPlatform(): Promise<Platform> {
  if (instance) return instance;
  if ('__TAURI_INTERNALS__' in window) {
    const { TauriPlatform } = await import('./tauri/TauriPlatform');
    instance = new TauriPlatform();
  } else {
    const { BrowserPlatform } = await import('./browser/BrowserPlatform');
    instance = new BrowserPlatform();
  }
  return instance;
}

export * from './types';
