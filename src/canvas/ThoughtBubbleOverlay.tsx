import { useEffect, useRef, useState } from 'react';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { ThoughtBubble } from '@/design/icons/ThoughtBubble';
import { useLibraryStore } from '@/state/libraryStore';
import { useDescriptionStore } from '@/state/descriptionStore';
import { isMediaKind } from '@/lib/itemKinds';
import { en } from '@/i18n/en';

const SIZE_PX = 34;
const GAP_PX = 6;
const LIFT_PX = 26;
const MIN_CARD_PX = 48;
const LINGER_MS = 400;

/** The thought-bubble button next to a media card's top-right corner (Patch 1 · E2). Shows while
 * the card or the bubble is hovered, for 400 ms after leaving either (so the pointer can travel
 * from the picture to the bubble), and always while that item's description panel is open. */
export function ThoughtBubbleOverlay({ engine }: { engine: Engine | null }) {
  const items = useLibraryStore((s) => s.items);
  const openId = useDescriptionStore((s) => s.itemId);
  useCameraState(engine); // re-render (and re-position) on every camera change
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [overBubble, setOverBubble] = useState(false);
  const [lingerId, setLingerId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  function clearTimer(): void {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  // The last card we were on, kept briefly after the pointer leaves it or the bubble.
  useEffect(() => {
    if (!engine) return;
    return engine.on('hover', (id) => {
      setHoverId(id);
      if (id) {
        clearTimer();
        setLingerId(id);
      }
    });
  }, [engine]);

  useEffect(() => {
    if (hoverId || overBubble) return;
    clearTimer();
    timer.current = window.setTimeout(() => setLingerId(null), LINGER_MS);
    return clearTimer;
  }, [hoverId, overBubble]);

  const id = openId ?? hoverId ?? lingerId;
  const item = id ? items.get(id) : undefined;
  const rect = id && engine ? engine.getScreenRect(id) : null;
  if (!id || !item || !rect || !isMediaKind(item.kind)) return null;
  if (rect.w < MIN_CARD_PX || rect.h < MIN_CARD_PX) return null;

  // Next to the top-right corner; inside the corner when that would leave the window.
  let left = rect.x + rect.w + GAP_PX;
  let top = rect.y - LIFT_PX;
  if (left + SIZE_PX > window.innerWidth || top < 0) {
    left = rect.x + rect.w - GAP_PX - SIZE_PX;
    top = rect.y + GAP_PX;
  }
  const hasDescription = !!item.descriptionText?.trim();
  const isOpen = openId === id;

  return (
    <button
      type="button"
      data-testid="thought-bubble"
      data-has-description={hasDescription ? 'true' : 'false'}
      aria-label={en.description.open}
      aria-pressed={isOpen}
      onPointerEnter={() => {
        clearTimer();
        setOverBubble(true);
      }}
      onPointerLeave={() => setOverBubble(false)}
      onClick={() => useDescriptionStore.getState().toggle(id)}
      style={{
        position: 'absolute',
        left,
        top,
        width: SIZE_PX,
        height: SIZE_PX,
        zIndex: 1,
        borderRadius: '50%',
        background: 'var(--surface-1)',
        color: hasDescription ? 'var(--accent)' : 'var(--text-2)',
        boxShadow: isOpen ? '0 0 0 2px var(--accent), var(--shadow-float)' : 'var(--shadow-float)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <ThoughtBubble filled={hasDescription} />
    </button>
  );
}
