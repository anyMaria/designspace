import type { Engine } from '@/canvas/Engine';
import { useLibraryStore } from '@/state/libraryStore';
import { useToastStore } from '@/state/toastStore';
import { pickRediscoverItem } from '@/lib/rediscover';
import { prefersReducedMotion } from '@/lib/motion';
import { en } from '@/i18n/en';

/** Rediscover (§2.15, "R" / the top-left button): picks an item via `pickRediscoverItem`, selects
 * it, flies to it and makes it pulse. A toast explains the no-op when nothing qualifies (fewer
 * than 30 days old, or everything's been viewed recently) rather than silently doing nothing. */
export function triggerRediscover(engine: Engine | null): void {
  const items = [...useLibraryStore.getState().items.values()];
  const picked = pickRediscoverItem(items, Date.now());
  if (!picked) {
    useToastStore.getState().show(en.toasts.nothingToRediscover);
    return;
  }
  useLibraryStore.getState().setSelection([picked.id]);
  engine?.zoomToIds([picked.id], prefersReducedMotion());
  engine?.pulseItem(picked.id);
}
