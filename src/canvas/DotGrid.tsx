import { useEffect, useRef } from 'react';
import type { Engine } from './Engine';
import { canvasGeometry } from '@/design/tokens';
import { useUiStore, type DotGridDensity } from '@/state/uiStore';

/** Settings → Canvas's manual density override (§2.14) on top of the automatic zoom-based
 * subdivision below. */
const DENSITY_MULTIPLIER: Record<DotGridDensity, number> = { fine: 0.5, normal: 1, wide: 2 };

/**
 * The bullet-journal dot grid, drawn in CSS behind the transparent Pixi canvas and kept in sync
 * with the camera — §3.4. Below `dotDenseThresholdPx` on-screen spacing it shows every 4th dot;
 * above `dotSparseThresholdPx` it subdivides. (Cross-fade between densities is a later polish
 * pass; M0 switches instantly.)
 */
export function DotGrid({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const { zoom } = engine.camera.state;

      let worldSpacing =
        canvasGeometry.dotGridWorldSpacing *
        DENSITY_MULTIPLIER[useUiStore.getState().dotGridDensity];
      let screenSpacing = worldSpacing * zoom;
      if (screenSpacing < canvasGeometry.dotDenseThresholdPx) {
        worldSpacing *= 4;
      } else if (screenSpacing > canvasGeometry.dotSparseThresholdPx) {
        worldSpacing /= 2;
      }
      screenSpacing = worldSpacing * zoom;

      const origin = engine.camera.worldToScreen(0, 0, vw, vh);
      const offsetX = ((origin.x % screenSpacing) + screenSpacing) % screenSpacing;
      const offsetY = ((origin.y % screenSpacing) + screenSpacing) % screenSpacing;

      el.style.backgroundSize = `${screenSpacing}px ${screenSpacing}px`;
      el.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    }

    update();
    const unsubscribe = engine.camera.subscribe(update);
    const unsubscribeDensity = useUiStore.subscribe((s, prev) => {
      if (s.dotGridDensity !== prev.dotGridDensity) update();
    });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      unsubscribe();
      unsubscribeDensity();
      resizeObserver.disconnect();
    };
  }, [engine]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: 'var(--canvas)',
      }}
    >
      <div
        ref={ref}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(var(--dot) ${canvasGeometry.dotScreenPx}px, transparent ${canvasGeometry.dotScreenPx}px)`,
        }}
      />
      {/* Subtle radial vignette darkening the edges — §3.4. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 55%, var(--canvas-edge) 130%)',
        }}
      />
    </div>
  );
}
