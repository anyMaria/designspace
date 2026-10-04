import { useState } from 'react';
import { Popover, Menu } from '@/design/components';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { prefersReducedMotion } from '@/lib/motion';
import { zoomRange } from '@/design/tokens';
import { en } from '@/i18n/en';
import { useEscape } from '@/app/useEscape';

/** The dock's zoom control: a percentage that opens Zoom to fit / Zoom to selection / 100 % /
 * Zoom in / Zoom out (§2.1). */
export function ZoomMenu({ engine }: { engine: Engine | null }) {
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false), { allowWhileTyping: true });
  const camera = useCameraState(engine);
  const pct = camera ? Math.round(camera.zoom * 100) : 100;

  function withMotion(fn: (reduceMotion: boolean) => void) {
    return () => {
      setOpen(false);
      fn(prefersReducedMotion());
    };
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="ds-icon-button"
        style={{ width: 'auto', padding: '0 var(--space-3)', minWidth: '6ch', textAlign: 'center' }}
        aria-label={en.zoomMenu.label}
        onClick={() => setOpen((o) => !o)}
      >
        {pct}%
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 2 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + var(--space-2))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
            }}
          >
            <Popover>
              <Menu
                aria-label={en.zoomMenu.label}
                items={[
                  {
                    id: 'fit',
                    label: en.zoomMenu.fit,
                    onSelect: withMotion((r) => engine?.zoomToFit(r)),
                  },
                  {
                    id: 'selection',
                    label: en.zoomMenu.selection,
                    onSelect: withMotion((r) => engine?.zoomToSelection(r)),
                  },
                  {
                    id: '100',
                    label: en.zoomMenu.oneHundred,
                    onSelect: withMotion((r) => engine?.zoomTo100(r)),
                  },
                  {
                    id: 'in',
                    label: en.zoomMenu.zoomIn,
                    onSelect: withMotion((r) => engine?.zoomStep(zoomRange.step, r)),
                  },
                  {
                    id: 'out',
                    label: en.zoomMenu.zoomOut,
                    onSelect: withMotion((r) => engine?.zoomStep(1 / zoomRange.step, r)),
                  },
                ]}
              />
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}
