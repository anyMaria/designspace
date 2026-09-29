import { useEffect, useRef } from 'react';
import { useLibraryStore } from '@/state/libraryStore';
import { useToastStore } from '@/state/toastStore';
import { en } from '@/i18n/en';

/** §4.13's soft cap: "at 9,500 the app shows a friendly note, but nothing blocks." A one-time
 * toast (per session) the moment the library's item count first reaches the threshold — not a
 * persistent banner, since nothing actually needs fixing and the owner shouldn't have to dismiss
 * it repeatedly. */
const SOFT_LIMIT = 9500;

export function useSoftLimitNotice(): void {
  const itemCount = useLibraryStore((s) => s.items.size);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || itemCount < SOFT_LIMIT) return;
    shown.current = true;
    useToastStore.getState().show(en.library.approachingLimit, { duration: 8000 });
  }, [itemCount]);
}
