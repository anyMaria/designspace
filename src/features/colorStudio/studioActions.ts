import type { Platform } from '@/platform/types';
import { useSettingsStore } from '@/state/settingsStore';
import { setLikedColors } from '@/state/loadSettings';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** Heart a colour (or un-heart it): the Liked shelf is kept per library. */
export function toggleLiked(platform: Platform, hex: string): void {
  const liked = useSettingsStore.getState().likedColors;
  const upper = hex.toUpperCase();
  void setLikedColors(
    platform,
    liked.includes(upper) ? liked.filter((h) => h !== upper) : [upper, ...liked],
  );
}

export async function copyHex(platform: Platform, hex: string): Promise<void> {
  try {
    await platform.clipboard.writeText(hex);
  } catch {
    // Denied clipboard (permissions): the toast would lie, so say nothing.
    return;
  }
  useToastStore.getState().show(en.colorStudio.copied(hex));
}
