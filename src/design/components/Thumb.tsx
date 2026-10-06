import { useEffect, useState, type CSSProperties } from 'react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { loadThumb } from '@/lib/thumbLoader';
import { thumbUrl } from '@/lib/thumbs';
import { KindIcon } from '@/lib/kindIcon';

type ThumbItem = Pick<Item, 'id' | 'thumbV'> &
  Partial<Pick<Item, 'kind' | 'swatchColors' | 'color' | 'fontCollection' | 'title'>>;

/** A picture that is never a blank square (Patch 3 · A3): while it loads, or if it can't, the
 * item's kind icon sits on `--surface-2`; when it arrives it fades in. Loads through the shared
 * queue (`thumbLoader`) and reloads when `item.thumbV` changes. Fills its parent. */
export function Thumb({
  platform,
  item,
  size,
  fit = 'cover',
  alt = '',
  enabled = true,
  style,
}: {
  platform: Platform;
  item: ThumbItem;
  size: 128 | 512;
  fit?: 'cover' | 'contain';
  alt?: string;
  /** False while the picture does not exist yet (the icon alone shows). */
  enabled?: boolean;
  style?: CSSProperties;
}) {
  const url = thumbUrl(platform, item, size);
  const [loaded, setLoaded] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadThumb(url, controller.signal)
      .then((src) => setLoaded({ url, src }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [url, enabled]);

  const src = enabled && loaded?.url === url ? loaded.src : null;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {!src && item.kind && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-3)',
          }}
        >
          <KindIcon
            item={{ swatchColors: null, color: null, ...item, kind: item.kind }}
            size={20}
          />
        </span>
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: fit,
            animation: 'ds-thumb-in var(--duration-overlay) ease both',
          }}
        />
      )}
    </div>
  );
}
