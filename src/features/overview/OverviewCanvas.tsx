import { useEffect, useRef } from 'react';
import { colors, fonts } from '@/design/tokens';
import { CRITERION_COLOR } from '@/canvas/criterionColor';
import { unionRects } from '@/lib/geometry';
import type { OverviewNodes } from './overviewStore';
import { nodeAt, type OverviewModel } from './overviewModel';
import { fitCamera, panBy, worldToScreen, zoomAt, type OverviewCamera } from './overviewCamera';

const THUMB_LONG_SIDE = 16;
const HOVER_LONG_SIDE = 40;
const DOT_RADIUS = 4;
const HIT_RADIUS = 10;
const MAX_BITMAPS = 2000;
const MAX_LOADS = 6;
const DRAG_THRESHOLD = 4;

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The Overview's drawing surface (Patch 1 · G2): canvas 2D with its own camera (fit on open,
 * wheel/pinch to zoom, drag to pan). Edges first, then nodes at a fixed screen size, then hubs.
 * Hovering a node enlarges it, shows its name and keeps its lines bright while everything else
 * fades. Double-click a node to go to it. */
export function OverviewCanvas({
  model,
  mode,
  onOpen,
}: {
  model: OverviewModel;
  mode: OverviewNodes;
  onOpen: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(model);
  const modeRef = useRef(mode);
  const cameraRef = useRef<OverviewCamera>({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<string | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const bitmaps = useRef(new Map<string, ImageBitmap | 'loading' | 'failed'>());
  const loading = useRef(0);
  const frame = useRef(0);
  // The camera refits whenever the layout changes (a different set of positions), not only once.
  const fittedFor = useRef('');
  const drawRef = useRef<() => void>(() => undefined);
  const screenNodes = useRef<{ id: string; x: number; y: number }[]>([]);

  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const requestDraw = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawRef.current();
    });
  };

  // Keep the latest model/mode for the drawing code, and fit the camera to a new layout.
  useEffect(() => {
    modelRef.current = model;
    modeRef.current = mode;
    const { w, h } = sizeRef.current;
    const first = model.nodes[0];
    const last = model.nodes[model.nodes.length - 1];
    const key =
      first && last ? `${model.nodes.length}:${first.x}:${first.y}:${last.x}:${last.y}` : '';
    if (key && key !== fittedFor.current && w > 0) {
      cameraRef.current = fitCamera(
        unionRects(model.nodes.map((n) => ({ x: n.x, y: n.y, w: 0, h: 0 }))),
        w,
        h,
      );
      fittedFor.current = key;
    }
    requestDraw();
  }, [model, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement as HTMLElement;

    function loadBitmap(id: string, url: string): void {
      const cache = bitmaps.current;
      if (cache.has(id) || loading.current >= MAX_LOADS) return;
      cache.set(id, 'loading');
      loading.current++;
      void fetch(url)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => createImageBitmap(b))
        .then((bm) => {
          if (cache.size > MAX_BITMAPS) {
            for (const [k, v] of cache) {
              if (v !== 'loading') {
                if (v !== 'failed') v.close();
                cache.delete(k);
                break;
              }
            }
          }
          cache.set(id, bm);
        })
        .catch(() => cache.set(id, 'failed'))
        .finally(() => {
          loading.current--;
          requestDraw();
        });
    }

    function draw(): void {
      const { w, h } = sizeRef.current;
      const ctx = canvas!.getContext('2d');
      if (!ctx || w === 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas!.width !== Math.round(w * dpr) || canvas!.height !== Math.round(h * dpr)) {
        canvas!.width = Math.round(w * dpr);
        canvas!.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const m = modelRef.current;
      const cam = cameraRef.current;
      const hover = hoverRef.current;
      const point = new Map<string, { x: number; y: number }>();
      screenNodes.current = [];
      for (const n of m.nodes) {
        const s = worldToScreen(cam, n.x, n.y, w, h);
        point.set(n.id, s);
        if (s.x > -40 && s.x < w + 40 && s.y > -40 && s.y < h + 40) {
          screenNodes.current.push({ id: n.id, x: s.x, y: s.y });
        }
      }
      for (const hub of m.hubs) point.set(hub.id, worldToScreen(cam, hub.x, hub.y, w, h));

      // Edges first.
      for (const e of m.edges) {
        const a = point.get(e.aId);
        const b = point.get(e.bId);
        if (!a || !b) continue;
        const touches = hover !== null && (e.aId === hover || e.bId === hover);
        ctx.globalAlpha = e.manual
          ? hover && !touches
            ? 0.3
            : 0.9
          : touches
            ? 0.9
            : hover
              ? 0.12
              : 0.35;
        ctx.strokeStyle = css(CRITERION_COLOR[e.criterion]);
        ctx.lineWidth = touches ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes at a fixed screen size.
      const thumbs = modeRef.current === 'thumbnails';
      for (const n of m.nodes) {
        const s = point.get(n.id);
        if (!s || s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) continue;
        const isHover = n.id === hover;
        ctx.globalAlpha = hover && !isHover ? 0.25 : 1;
        if (!thumbs) {
          ctx.fillStyle = css(n.color);
          ctx.beginPath();
          ctx.arc(s.x, s.y, isHover ? 9 : DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const long = isHover ? HOVER_LONG_SIDE : THUMB_LONG_SIDE;
        const nw = n.aspect >= 1 ? long : long * n.aspect;
        const nh = n.aspect >= 1 ? long / n.aspect : long;
        const x = s.x - nw / 2;
        const y = s.y - nh / 2;
        const bm = n.thumbUrl ? bitmaps.current.get(n.id) : undefined;
        if (n.thumbUrl && bm === undefined) loadBitmap(n.id, n.thumbUrl);
        if (bm && bm !== 'loading' && bm !== 'failed') {
          ctx.drawImage(bm, x, y, nw, nh);
        } else {
          ctx.fillStyle = css(n.color);
          ctx.beginPath();
          ctx.roundRect(x, y, nw, nh, 3);
          ctx.fill();
        }
      }

      // Hubs: a star and an uppercase label.
      ctx.globalAlpha = hover ? 0.5 : 1;
      for (const hub of m.hubs) {
        const s = point.get(hub.id);
        if (!s) continue;
        ctx.fillStyle = css(CRITERION_COLOR[hub.criterion]);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 8 : 3.5;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = css(colors.text1);
        ctx.font = `600 11px ${fonts.ui}`;
        ctx.textAlign = 'center';
        ctx.fillText(hub.label.toUpperCase(), s.x, s.y + 22);
      }

      // The hovered node's name.
      ctx.globalAlpha = 1;
      const hovered = hover ? m.nodes.find((n) => n.id === hover) : undefined;
      const hs = hover ? point.get(hover) : undefined;
      if (hovered && hs) {
        ctx.font = `600 13px ${fonts.ui}`;
        const label = hovered.title.length > 40 ? `${hovered.title.slice(0, 39)}…` : hovered.title;
        const tw = ctx.measureText(label).width + 20;
        const ty = hs.y + (thumbs ? HOVER_LONG_SIDE / 2 : 9) + 8;
        ctx.fillStyle = 'rgba(42,24,50,0.92)';
        ctx.beginPath();
        ctx.roundRect(hs.x - tw / 2, ty, tw, 26, 13);
        ctx.fill();
        ctx.fillStyle = css(colors.text1);
        ctx.textAlign = 'center';
        ctx.fillText(label, hs.x, ty + 17);
      }
      ctx.globalAlpha = 1;
    }
    drawRef.current = draw;

    const resize = () => {
      sizeRef.current = { w: parent.clientWidth, h: parent.clientHeight };
      canvas.style.width = `${sizeRef.current.w}px`;
      canvas.style.height = `${sizeRef.current.h}px`;
      const m = modelRef.current;
      if (!fittedFor.current && m.nodes.length > 0) {
        // The first size arrives after the first model: fit now.
        cameraRef.current = fitCamera(
          unionRects(m.nodes.map((n) => ({ x: n.x, y: n.y, w: 0, h: 0 }))),
          sizeRef.current.w,
          sizeRef.current.h,
        );
        fittedFor.current = 'initial';
      }
      requestDraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    // --- interaction ---
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      cameraRef.current = zoomAt(
        cameraRef.current,
        factor,
        p.x,
        p.y,
        sizeRef.current.w,
        sizeRef.current.h,
      );
      requestDraw();
    };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        cameraRef.current = panBy(cameraRef.current, dx, dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        hoverRef.current = null;
        requestDraw();
        return;
      }
      const p = local(e);
      const id = nodeAt(screenNodes.current, p.x, p.y, HIT_RADIUS);
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        canvas.style.cursor = id ? 'pointer' : 'grab';
        requestDraw();
      }
    };
    const onUp = (e: PointerEvent) => {
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        requestDraw();
      }
    };
    const onDouble = (e: MouseEvent) => {
      const p = local(e);
      const id = nodeAt(screenNodes.current, p.x, p.y, HIT_RADIUS);
      if (id) onOpenRef.current(id);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dblclick', onDouble);
    const cache = bitmaps.current;
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDouble);
      for (const v of cache.values()) if (v !== 'loading' && v !== 'failed') v.close();
      cache.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="overview-canvas"
      style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
    />
  );
}
