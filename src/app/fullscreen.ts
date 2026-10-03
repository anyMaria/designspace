import type { Platform } from '@/platform';
import { useUiStore } from '@/state/uiStore';
import { useToastStore } from '@/state/toastStore';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';

let hintShown = false;

/** Enters or leaves full screen (Patch 1 · B1) and keeps `uiStore.fullscreen` in step. The hint
 * toast shows once per session, on the first time we enter. */
export async function setFullscreen(platform: Platform, on: boolean): Promise<void> {
  try {
    await platform.window.setFullscreen(on);
    useUiStore.getState().setFullscreen(on);
    if (on && !hintShown) {
      hintShown = true;
      useToastStore.getState().show(en.fullscreen.hint);
    }
  } catch (err) {
    logger.warn('Changing full screen failed', err);
  }
}

export async function toggleFullscreen(platform: Platform): Promise<void> {
  // Ask the window, not our flag: the OS can leave full screen without us (e.g. Alt+Enter).
  let current = useUiStore.getState().fullscreen;
  try {
    current = await platform.window.isFullscreen();
  } catch (err) {
    logger.warn('Reading full screen state failed', err);
  }
  await setFullscreen(platform, !current);
}
