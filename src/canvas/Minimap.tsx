import { useRef } from 'react';
import { useLibraryStore } from '@/state/libraryStore';
import { unionRects } from '@/lib/geometry';
import { en } from '@/i18n/en';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';

const MAP_W = 160;
const MAP_H = 110;
const PAD = 20; // world-bounds padding so the viewport rect never touches the edge

/** Every item as a dot plus the viewport rectangle; click or drag to navigate (§2.1, M key). */
export function Minimap({ engine }: { engine: Engine | null }) {
  const placements = useLibraryStore((s) => s.placements);
  const camera = useCameraState(engine);
  const draggingRef = useRef(false);

  const rects = [...placements.values()].map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
  const bounds = unionRects(rects);
  const viewport = engine?.viewportSize() ?? { w: 0, h: 0 };

  // World bounds cover every item and the current viewport, so panning never falls outside the map.
  const viewportRect = camera
    ? {
        x: camera.x - viewport.w / 2 / camera.zoom,
        y: camera.y - viewport.h / 2 / camera.zoom,
        w: viewport.w / camera.zoom,
        h: viewport.h / camera.zoom,
      }
    : null;
  const worldBounds = unionRects([...(bounds ? [bounds] : []), ...(viewportRect ? [viewportRect] : [])]) ?? {
    x: -500,
    y: -500,
    w: 1000,
    h: 1000,
  };

  const scale = Math.min(
    MAP_W / (worldBounds.w + PAD * 2),
    MAP_H / (worldBounds.h + PAD * 2),
  );
  const originX = worldBounds.x - PAD;
  const originY = worldBounds.y - PAD;

  function toMap(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - originX) * scale, y: (wy - originY) * scale };
  }

  function toWorld(mx: number, my: number): { x: number; y: number } {
    return { x: mx / scale + originX, y: my / scale + originY };
  }

  function navigate(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    engine?.panTo(world.x, world.y);
  }

  return (
    <div
      role="img"
      aria-label={en.minimap.label}
      style={{
        position: 'relative',
        width: MAP_W,
        height: MAP_H,
        overflow: 'hidden',
        borderRadius: 'var(--radius-input)',
        cursor: 'crosshair',
      }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        navigate(e);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) navigate(e);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
    >
      {rects.map((r, i) => {
        const p = toMap(r.x + r.w / 2, r.y + r.h / 2);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 1,
              top: p.y - 1,
              width: 2,
              height: 2,
              borderRadius: '50%',
              background: 'var(--text-3)',
            }}
          />
        );
      })}
      {viewportRect && (
        <div
          style={{
            position: 'absolute',
            left: toMap(viewportRect.x, viewportRect.y).x,
            top: toMap(viewportRect.x, viewportRect.y).y,
            width: viewportRect.w * scale,
            height: viewportRect.h * scale,
            border: '1px solid var(--accent)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
