import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  LayoutGrid,
  StretchHorizontal,
  StretchVertical,
} from 'lucide-react';
import type { Platform } from '@/platform/types';
import { IconButton } from '@/design/components';
import { useEscape } from '@/app/useEscape';
import { useLibraryStore } from '@/state/libraryStore';
import { en } from '@/i18n/en';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { ALIGN_LABEL, arrangeableIds, runAlignAction, type AlignAction } from './alignActions';

const BUTTON_PX = 40;
const GAP_PX = 10;
const PANEL_HEIGHT_PX = 260;
const ICON = { size: 18, strokeWidth: 1.75 } as const;

interface Entry {
  action: AlignAction;
  icon: ReactNode;
  shortcut?: string;
}

const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: en.align.groupAlign,
    entries: [
      { action: 'left', icon: <AlignStartVertical {...ICON} />, shortcut: 'Alt+A' },
      { action: 'hcenter', icon: <AlignCenterVertical {...ICON} />, shortcut: 'Alt+H' },
      { action: 'right', icon: <AlignEndVertical {...ICON} />, shortcut: 'Alt+D' },
      { action: 'top', icon: <AlignStartHorizontal {...ICON} />, shortcut: 'Alt+W' },
      { action: 'vcenter', icon: <AlignCenterHorizontal {...ICON} />, shortcut: 'Alt+V' },
      { action: 'bottom', icon: <AlignEndHorizontal {...ICON} />, shortcut: 'Alt+S' },
    ],
  },
  {
    title: en.align.groupSpacing,
    entries: [
      {
        action: 'distribute-x',
        icon: <AlignHorizontalSpaceBetween {...ICON} />,
        shortcut: 'Alt+Shift+H',
      },
      {
        action: 'distribute-y',
        icon: <AlignVerticalSpaceBetween {...ICON} />,
        shortcut: 'Alt+Shift+V',
      },
    ],
  },
  {
    title: en.align.groupSize,
    entries: [
      { action: 'same-width', icon: <StretchHorizontal {...ICON} /> },
      { action: 'same-height', icon: <StretchVertical {...ICON} /> },
    ],
  },
  {
    title: en.align.tidyUp,
    entries: [{ action: 'tidy-up', icon: <LayoutGrid {...ICON} /> }],
  },
];

/** One small button above a selection of two or more cards (Patch 3 · C4); it opens a panel with
 * every way to line the cards up: align, equal spacing, same size, tidy up (like the alignment
 * panel in Adobe's apps). Hidden while a card is being moved or resized. */
export function AlignBar({ engine, platform }: { engine: Engine | null; platform: Platform }) {
  const selection = useLibraryStore((s) => s.selection);
  useLibraryStore((s) => s.placements); // follow the cards when they move
  useCameraState(engine);
  const [dragging, setDragging] = useState(false);
  // The panel belongs to one selection: `openFor` is that selection's key.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine) return;
    return engine.on('dragState', setDragging);
  }, [engine]);

  const ids = engine && !dragging ? arrangeableIds([...selection]) : [];
  const shown = ids.length >= 2;
  const open = shown && openFor === ids.join(',');

  // Esc closes the panel first; so does a press anywhere outside it.
  useEscape(open, () => setOpenFor(null));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenFor(null);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [open]);

  if (!engine || !shown) return null;
  const rects = ids.flatMap((id) => {
    const r = engine.getScreenRect(id);
    return r ? [r] : [];
  });
  if (rects.length < 2) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const top = Math.min(...rects.map((r) => r.y));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  const above = top - GAP_PX - BUTTON_PX >= 8;
  const y = above ? top - GAP_PX : bottom + GAP_PX;
  const panelAbove = y - BUTTON_PX - GAP_PX - PANEL_HEIGHT_PX >= 8 && above;

  return (
    <div
      ref={rootRef}
      data-testid="align-bar"
      style={{
        position: 'absolute',
        left: Math.max(8, Math.min((left + right) / 2, window.innerWidth - 8)),
        top: y,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 2,
        display: 'flex',
        flexDirection: panelAbove ? 'column-reverse' : 'column',
        alignItems: 'center',
        gap: GAP_PX,
      }}
    >
      <div className="ds-dock" style={{ padding: 'var(--space-1)' }}>
        <IconButton
          icon={<AlignStartVertical {...ICON} />}
          label={en.align.open}
          active={open}
          onClick={() => setOpenFor(open ? null : ids.join(','))}
        />
      </div>
      {open && (
        <div
          role="dialog"
          aria-label={en.align.open}
          className="ds-popover"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          {GROUPS.map((group) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
                {group.title}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                {group.entries.map(({ action, icon, shortcut }) => {
                  const needsThree =
                    (action === 'distribute-x' || action === 'distribute-y') && ids.length < 3;
                  return (
                    <IconButton
                      key={action}
                      icon={icon}
                      label={
                        needsThree
                          ? `${ALIGN_LABEL[action]} · ${en.align.needThree}`
                          : ALIGN_LABEL[action]
                      }
                      shortcut={shortcut}
                      disabled={needsThree}
                      onClick={() => runAlignAction(platform, ids, action)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
