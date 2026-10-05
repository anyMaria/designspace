import { useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { browseOrder, neighbourId } from '@/lib/browseOrder';
import { useFocusStore } from '@/state/focusStore';
import { IconButton } from '@/design/components';
import { en } from '@/i18n/en';
import type { Engine } from '@/canvas/Engine';
import { PdfFocusViewer } from './PdfFocusViewer';
import { FontFocusViewer } from './FontFocusViewer';
import { LinkFocusViewer } from './LinkFocusViewer';
import { useEscape } from '@/app/useEscape';

/** Full-window overlay for one image (§2.12). Simplifications logged in docs/DECISIONS.md: no
 * zoom/pan/fit-vs-1:1 toggle yet (the image is always letterboxed to fit), and no collapsible
 * Details column (those fields don't exist until M2's classification panel). ← / → walk the
 * currently loaded item order; a real "list order, or results newest-first" needs the List
 * panel's sort, which is also M2. */
export function FocusView({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const itemId = useFocusStore((s) => s.itemId);
  const close = useFocusStore((s) => s.close);
  const item = useLibraryStore((s) => (itemId ? s.items.get(itemId) : undefined));
  const items = useLibraryStore((s) => s.items);
  const placements = useLibraryStore((s) => s.placements);

  // Reading order on the current space, the same order Shift+Space / Ctrl+Space use on the map.
  const order = useMemo(() => {
    const browse = browseOrder(items, placements);
    return itemId && !browse.includes(itemId) ? [...browse, itemId] : browse;
  }, [items, placements, itemId]);
  const index = itemId ? order.indexOf(itemId) : -1;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < order.length - 1;

  useEffect(() => {
    if (!itemId) return;
    const now = new Date().toISOString();
    void platform.db.execute('UPDATE items SET viewed_at = ? WHERE id = ?', [now, itemId]);
    const current = useLibraryStore.getState().items.get(itemId);
    if (current) useLibraryStore.getState().upsertItem({ ...current, viewedAt: now });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the shown item changes
  }, [itemId]);

  useEffect(() => {
    if (!itemId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && hasPrev) {
        useFocusStore.getState().open(order[index - 1]);
      } else if (e.key === 'ArrowRight' && hasNext) {
        useFocusStore.getState().open(order[index + 1]);
      } else if (e.code === 'Space' && (e.shiftKey || e.ctrlKey) && !e.altKey) {
        // Shift+Space: the next one, Ctrl+Space: the previous one (wraps around).
        e.preventDefault();
        const next = neighbourId(order, itemId, e.shiftKey ? 1 : -1);
        if (next && next !== itemId) useFocusStore.getState().open(next);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [itemId, index, hasPrev, hasNext, order, close]);

  useEscape(!!itemId, close, { allowWhileTyping: true });

  if (!itemId || !item) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        background: 'rgba(8, 2, 12, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={close}
    >
      <div
        style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          icon={<X size={20} strokeWidth={1.75} />}
          label={en.focusView.close}
          onClick={close}
        />
      </div>

      {hasPrev && (
        <div
          style={{
            position: 'absolute',
            left: 'var(--space-4)',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            icon={<ChevronLeft size={20} strokeWidth={1.75} />}
            label={en.focusView.previous}
            onClick={() => useFocusStore.getState().open(order[index - 1])}
          />
        </div>
      )}
      {hasNext && (
        <div
          style={{
            position: 'absolute',
            right: 'var(--space-4)',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            icon={<ChevronRight size={20} strokeWidth={1.75} />}
            label={en.focusView.next}
            onClick={() => useFocusStore.getState().open(order[index + 1])}
          />
        </div>
      )}

      {item.kind === 'image' && item.filePath && (
        <img
          src={platform.media.originalUrl(item.filePath)}
          alt={item.title}
          style={{
            maxWidth: '85vw',
            maxHeight: '80vh',
            objectFit: 'contain',
            borderRadius: 'var(--radius-sm)',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {item.kind === 'video' &&
        item.filePath &&
        (item.status === 'unsupported' ? (
          <div
            style={{
              width: 'min(85vw, 640px)',
              aspectRatio: '16 / 9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {en.video.unsupportedFallback}
          </div>
        ) : (
          // "Player with controls, loop, mute" (§2.4) — the browser's own controls include mute;
          // `loop` restarts at the end rather than closing Focus view.
          <video
            key={item.id}
            src={platform.media.originalUrl(item.filePath)}
            controls
            loop
            autoPlay
            style={{
              maxWidth: '85vw',
              maxHeight: '80vh',
              borderRadius: 'var(--radius-sm)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {en.video.playerFallback}
          </video>
        ))}
      {item.kind === 'pdf' &&
        item.filePath &&
        (item.status === 'unsupported' ? (
          <div
            style={{
              width: 'min(85vw, 640px)',
              aspectRatio: '3 / 4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {en.pdf.unsupportedFallback}
          </div>
        ) : (
          <PdfFocusViewer key={item.id} platform={platform} item={item} engine={engine} />
        ))}
      {item.kind === 'font' &&
        item.filePath &&
        (item.status === 'unsupported' ? (
          <div
            style={{
              width: 'min(85vw, 640px)',
              aspectRatio: '8 / 5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {en.font.unsupportedFallback}
          </div>
        ) : (
          <FontFocusViewer key={item.id} platform={platform} item={item} />
        ))}
      {item.kind === 'link' && <LinkFocusViewer key={item.id} platform={platform} item={item} />}
      {item.kind !== 'link' && (
        <div style={{ marginTop: 'var(--space-4)', color: 'var(--text-2)' }}>
          {item.title || item.fileName}
        </div>
      )}
    </div>
  );
}
