import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { useLibraryStore } from '@/state/libraryStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useOverviewStore } from '@/features/overview/overviewStore';
import { colors, noteColors, type NoteColor } from '@/design/tokens';
import { unionRects } from '@/lib/geometry';
import { en } from '@/i18n/en';
import type { Item } from '@/state/types';
import type { Engine } from './Engine';
import { useCameraState } from './useCameraState';
import { drawMinimap, fitMinimap, minimapToWorld, type MinimapScene } from './minimapDraw';

const MAP_W = 240;
const MAP_H = 160;
const PAD = 20; // world-bounds padding so the viewport rect never touches the edge
const FALLBACK_COLOR = 0x6f5a7a;

function hexToInt(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(n) ? n : FALLBACK_COLOR;
}

/** An item's colour on the minimap: its card colour (note paper, swatch colour, first palette colour). */
function minimapColorOf(item: Item | undefined): number {
  if (!item) return FALLBACK_COLOR;
  if (item.kind === 'note')
    return noteColors[(item.color as NoteColor | null) ?? 'cream'] ?? FALLBACK_COLOR;
  if (item.kind === 'swatch') return item.color ? hexToInt(item.color) : FALLBACK_COLOR;
  const first = item.palette?.[0]?.hex;
  return first ? hexToInt(first) : FALLBACK_COLOR;
}

/** Items with their real shape and colour, My connections, the hover/selection lines and the
 * viewport rectangle on one canvas; click or drag to navigate, double-click or the expand button
 * opens the Overview (§2.1, M key; Patch 1 · G1). */
export function Minimap({ engine }: { engine: Engine | null }) {
  const placements = useLibraryStore((s) => s.placements);
  const items = useLibraryStore((s) => s.items);
  const manual = useManualConnectionsStore((s) => s.connections);
  const camera = useCameraState(engine);
  const [hoverLines, setHoverLines] = useState<{ fromId: string; toId: string; color: number }[]>(
    [],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const transformRef = useRef(fitMinimap({ x: 0, y: 0, w: 1000, h: 1000 }, MAP_W, MAP_H, PAD));

  useEffect(() => {
    if (!engine) return;
    return engine.on('connectionsChanged', setHoverLines);
  }, [engine]);

  // One repaint per change, coalesced to one animation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== MAP_W * dpr) {
        canvas.width = MAP_W * dpr;
        canvas.height = MAP_H * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MAP_W, MAP_H);

      const viewportSize = engine?.viewportSize() ?? { w: 0, h: 0 };
      const viewport = camera
        ? {
            x: camera.x - viewportSize.w / 2 / camera.zoom,
            y: camera.y - viewportSize.h / 2 / camera.zoom,
            w: viewportSize.w / camera.zoom,
            h: viewportSize.h / camera.zoom,
          }
        : null;
      const rects = [...placements.values()].map((p) => ({
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        color: minimapColorOf(items.get(p.itemId)),
      }));
      const world = unionRects([...rects, ...(viewport ? [viewport] : [])]) ?? {
        x: -500,
        y: -500,
        w: 1000,
        h: 1000,
      };
      const t = fitMinimap(world, MAP_W, MAP_H, PAD);
      transformRef.current = t;

      const centre = (id: string) => {
        const p = placements.get(id);
        return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : null;
      };
      const scene: MinimapScene = { rects, manualLines: [], hoverLines: [], viewport };
      for (const c of manual.values()) {
        const a = centre(c.fromId);
        const b = centre(c.toId);
        if (a && b) scene.manualLines.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
      for (const l of hoverLines) {
        const a = centre(l.fromId);
        const b = centre(l.toId);
        if (a && b) scene.hoverLines.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, color: l.color });
      }
      drawMinimap(ctx, t, scene, `#${colors.accent.toString(16).padStart(6, '0')}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [engine, camera, placements, items, manual, hoverLines]);

  function navigate(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = minimapToWorld(transformRef.current, e.clientX - rect.left, e.clientY - rect.top);
    engine?.panTo(world.x, world.y);
  }

  return (
    <div
      role="img"
      aria-label={en.minimap.label}
      data-testid="minimap"
      style={{
        position: 'relative',
        width: MAP_W,
        height: MAP_H,
        overflow: 'hidden',
        borderRadius: 'var(--radius-input)',
        cursor: 'crosshair',
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button')) return;
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
      onDoubleClick={() => useOverviewStore.getState().show()}
    >
      <canvas ref={canvasRef} style={{ width: MAP_W, height: MAP_H, display: 'block' }} />
      <button
        type="button"
        aria-label={en.overview.expand}
        title={en.overview.expand}
        onClick={() => useOverviewStore.getState().show()}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-2)',
          color: 'var(--text-2)',
          cursor: 'pointer',
        }}
      >
        <Maximize2 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
