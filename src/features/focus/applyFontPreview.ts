import type { Platform } from '@/platform/types';
import { setFontPreviewText } from '@/state/loadSettings';
import { rerenderFontSpecimens } from '@/workers/fontIngestQueue';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** Saves the preview text (Patch 1 · F2) and re-renders every font card with it. */
export async function applyFontPreview(platform: Platform, text: string): Promise<void> {
  await setFontPreviewText(platform, text);
  const n = await rerenderFontSpecimens(platform);
  if (n > 0) useToastStore.getState().show(en.font.updatingCards(n));
}
