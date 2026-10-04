import { en } from '@/i18n/en';
import { useLibraryStore } from '@/state/libraryStore';
import { Star } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { noteColors, noteStyles, type NoteColor } from '@/design/tokens';
import { swatchColorsOf } from '@/lib/palette';
import { sourceDomain } from '@/lib/search';
import { thumbUrl } from '@/lib/thumbs';

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** What a List (or Trash) tile shows for each kind of item (Patch 2 · C7) — never an `<img>`
 * without a `src`. Fills its parent, which sets the size and the shape. */
export function ListTile({ platform, item }: { platform: Platform; item: Item }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TileBody platform={platform} item={item} />
      {item.favorite && (
        <span
          aria-label="favorite"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(30, 16, 36, 0.72)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Star size={12} strokeWidth={0} fill="currentColor" />
        </span>
      )}
    </div>
  );
}

function TileBody({ platform, item }: { platform: Platform; item: Item }) {
  const fill = { width: '100%', height: '100%' } as const;

  if (item.kind === 'swatch') {
    const colors = swatchColorsOf(item).map((c) => c.hex);
    if (colors.length === 1) return <div style={{ ...fill, background: colors[0] }} />;
    return (
      <div
        data-testid="tile-palette"
        style={{
          ...fill,
          boxSizing: 'border-box',
          padding: 6,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
          background: 'var(--surface-2)',
        }}
      >
        {colors.slice(0, 8).map((hex, i) => (
          <span key={i} style={{ background: hex, borderRadius: 4 }} />
        ))}
      </div>
    );
  }

  if (item.kind === 'note') {
    const name = (item.color as NoteColor | null) ?? 'cream';
    const paper = noteColors[name] ?? noteColors.cream;
    const ink = (noteStyles[name] ?? noteStyles.cream).text;
    return (
      <div
        style={{
          ...fill,
          boxSizing: 'border-box',
          padding: 8,
          background: css(paper),
          color: css(ink),
          fontSize: 11,
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          whiteSpace: 'pre-wrap',
        }}
      >
        {item.bodyText ?? ''}
      </div>
    );
  }

  if (item.kind === 'link' && !(item.status === 'ok' && item.coverPath)) {
    return (
      <div
        style={{
          ...fill,
          boxSizing: 'border-box',
          padding: 8,
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflow: 'hidden',
        }}
      >
        <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{sourceDomain(item.url)}</span>
        <span
          style={{
            fontSize: 11,
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.title}
        </span>
      </div>
    );
  }

  if (item.kind === 'font' && item.fontCollection) {
    const names = item.fontCollection.ids
      .slice(0, 3)
      .map((id) => useLibraryStore.getState().items.get(id)?.title ?? '')
      .filter(Boolean);
    return (
      <div
        style={{
          ...fill,
          padding: 8,
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflow: 'hidden',
          fontSize: 11,
        }}
      >
        <strong>{en.fontCollection.families(item.fontCollection.ids.length)}</strong>
        {names.map((n) => (
          <span
            key={n}
            style={{
              color: 'var(--text-2)',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    );
  }

  const hasThumb = item.status === 'ok';
  const isFont = item.kind === 'font';
  return (
    <div style={{ ...fill, background: 'var(--surface-2)' }}>
      {hasThumb && (
        <img
          src={thumbUrl(platform, item, 128)}
          alt=""
          style={{ ...fill, objectFit: isFont ? 'contain' : 'cover' }}
        />
      )}
    </div>
  );
}
