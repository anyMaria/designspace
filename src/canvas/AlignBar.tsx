import { useEffect, useState, type ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  LayoutGrid,
  StretchHorizontal,
  StretchVertical,
} from 'lucide-react';
import type { Platform } from '@/platform/types';
import { Dock, DockDivider, IconButton } from '@/design/components';
import { useLibraryStore } from '@/state/libraryStore';
import { en } from '@/i18n/en';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { ALIGN_LABEL, arrangeableIds, runAlignAction, type AlignAction } from './alignActions';

const BAR_HEIGHT_PX = 52;
const GAP_PX = 10;
const ICON = { size: 18, strokeWidth: 1.75 } as const;

const GROUPS: { action: AlignAction; icon: ReactNode; shortcut?: string }[][] = [
  [
    { action: 'left', icon: <AlignStartVertical {...ICON} />, shortcut: 'Alt+A' },
    { action: 'hcenter', icon: <AlignCenterVertical {...ICON} />, shortcut: 'Alt+H' },
    { action: 'right', icon: <AlignEndVertical {...ICON} />, shortcut: 'Alt+D' },
  ],
  [
    { action: 'top', icon: <AlignStartHorizontal {...ICON} />, shortcut: 'Alt+W' },
    { action: 'vcenter', icon: <AlignCenterHorizontal {...ICON} />, shortcut: 'Alt+V' },
    { action: 'bottom', icon: <AlignEndHorizontal {...ICON} />, shortcut: 'Alt+S' },
  ],
  [
    {
      action: 'distribute-x',
      icon: <AlignHorizontalDistributeCenter {...ICON} />,
      shortcut: 'Alt+Shift+H',
    },
    {
      action: 'distribute-y',
      icon: <AlignVerticalDistributeCenter {...ICON} />,
      shortcut: 'Alt+Shift+V',
    },
  ],
  [
    { action: 'same-width', icon: <StretchHorizontal {...ICON} /> },
    { action: 'same-height', icon: <StretchVertical {...ICON} /> },
    { action: 'tidy-up', icon: <LayoutGrid {...ICON} /> },
  ],
];

/** A small floating bar above a selection of two or more cards (Patch 3 · C4): align, distribute,
 * same size and tidy up. Hidden while a card is being moved or resized. */
export function AlignBar({ engine, platform }: { engine: Engine | null; platform: Platform }) {
  const selection = useLibraryStore((s) => s.selection);
  useLibraryStore((s) => s.placements); // follow the cards when they move
  useCameraState(engine);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!engine) return;
    return engine.on('dragState', setDragging);
  }, [engine]);

  if (!engine || dragging) return null;
  const ids = arrangeableIds([...selection]);
  if (ids.length < 2) return null;

  const rects = ids.flatMap((id) => {
    const r = engine.getScreenRect(id);
    return r ? [r] : [];
  });
  if (rects.length < 2) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const top = Math.min(...rects.map((r) => r.y));
  const above = top - GAP_PX - BAR_HEIGHT_PX >= 8;
  const y = above ? top - GAP_PX : Math.max(...rects.map((r) => r.y + r.h)) + GAP_PX;

  return (
    <div
      data-testid="align-bar"
      style={{
        position: 'absolute',
        left: Math.max(8, Math.min((left + right) / 2, window.innerWidth - 8)),
        top: y,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 2,
      }}
    >
      <Dock role="toolbar" aria-label={en.align.bar}>
        {GROUPS.map((group, gi) => (
          <span key={gi} style={{ display: 'contents' }}>
            {gi > 0 && <DockDivider />}
            {group.map(({ action, icon, shortcut }) => (
              <IconButton
                key={action}
                icon={icon}
                label={ALIGN_LABEL[action]}
                shortcut={shortcut}
                disabled={
                  (action === 'distribute-x' || action === 'distribute-y') && ids.length < 3
                }
                onClick={() => runAlignAction(platform, ids, action)}
              />
            ))}
          </span>
        ))}
      </Dock>
    </div>
  );
}
