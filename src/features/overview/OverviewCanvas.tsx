import { useEffect, useRef } from 'react';
import { colors, fonts, motion } from '@/design/tokens';
import { prefersReducedMotion } from '@/lib/motion';
import { CRITERION_COLOR } from '@/canvas/criterionColor';
import { unionRects } from '@/lib/geometry';
import type { OverviewNodes } from './overviewStore';
import { nodeAt, type OverviewModel } from './overviewModel';
import {
  fitCamera,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type OverviewCamera,
} from './overviewCamera';
import type { LivePositions } from './graphSim';

// A node is 32 world units on its long side, drawn between 12 and 64 screen px (Patch 2 · B2).
const NODE_WORLD_LONG_SIDE = 32;
const NODE_MIN_PX = 12;
const NODE_MAX_PX = 64;
const FOCUS_FADE_ALPHA = 0.15;
/** What is not connected to the hovered dot or star dims to this (Patch 3 · D2). */
const HOVER_DIM_ALPHA = 0.3;
const STAR_HIT_PX = 14;
const HOVER_LONG_SIDE = 40;
const DOT_RADIUS = 4;
const HIT_RADIUS = 10;
const MAX_BITMAPS = 2000;
const MAX_LOADS = 6;
const DRAG_THRESHOLD = 4;

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

type Drag =
  | { kind: 'pan'; x: number; y: number; moved: boolean }
  | { kind: 'node'; id: string; startX: number; startY: number; moved: boolean };

/** The Overview's drawing surface (Patch 1 · G2): canvas 2D with its own camera (fit when it opens
 * or the layout switches, wheel/pinch to zoom, drag empty space to pan). Edges first, then nodes at
 * a fixed screen size, then stars. In Clusters the positions are live (Patch 3 · D1): dragging a dot
 * or a star moves it and its neighbours follow, then everything settles; dragging never changes the
 * real map. Hovering a node or star keeps its links bright and dims the rest. Double-click a node to
 * go to it. */
export function OverviewCanvas({
  model,
  mode,
  focusHubKey,
  onFocusHub,
  onOpen,
  live,
  fitKey,
  onDragNode,
  onReleaseNode,
}: {
  model: OverviewModel;
  mode: OverviewNodes;
  /** A clicked star (`criterion:value`): its members stay bright, everything else fades. */
  focusHubKey: string | null;
  onFocusHub: (key: string | null) => void;
  onOpen: (id: string) => void;
  /** Clusters: positions moved by the simulation, read every frame. Null in My layout. */
  live: LivePositions | null;
  /** The camera fits once each time this changes — never after a drag or a Spacing change. */
  fitKey: string;
  /** Dots and stars can be dragged when there is a simulation (Clusters). World coordinates. */
  onDragNode: (id: string, x: number, y: number) => void;
  onReleaseNode: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef(model);
  const modeRef = useRef(mode);
  const focusRef = useRef(focusHubKey);
  const liveRef = useRef(live);
  const fitKeyRef = useRef(fitKey);
  // Settling (Patch 2 · B2), My layout only: when a new layout arrives, nodes and stars tween.
  const targets = useRef(new Map<string, { x: number; y: number }>());
  const anim = useRef<{
    start: number;
    from: Map<string, { x: number; y: number }>;
    to: Map<string, { x: number; y: number }>;
  } | null>(null);
  const screenHubs = useRef<{ key: string; x: number; y: number }[]>([]);
  const cameraRef = useRef<OverviewCamera>({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<string | null>(null);
  const hoverStarRef = useRef<string | null>(null);
  /** A node being dragged: where the pointer holds it, in world coordinates. */
  const heldRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const bitmaps = useRef(new Map<string, ImageBitmap | 'loading' | 'failed'>());
  const loading = useRef(0);
  const frame = useRef(0);
  const fittedFor = useRef('');
  const drawRef = useRef<() => void>(() => undefined);
  const screenNodes = useRef<{ id: string; x: number; y: number }[]>([]);

  const onOpenRef = useRef(onOpen);
  const onFocusHubRef = useRef(onFocusHub);
  const onDragRef = useRef(onDragNode);
  const onReleaseRef = useRef(onReleaseNode);
  useEffect(() => {
    onOpenRef.current = onOpen;
    onFocusHubRef.current = onFocusHub;
    onDragRef.current = onDragNode;
    onReleaseRef.current = onReleaseNode;
  }, [onOpen, onFocusHub, onDragNode, onReleaseNode]);

  // Where a node or star is drawn right now: held by the pointer, else live (Clusters), else the
  // static layout (mid-settle it is between old and new).
  const placeOf = (id: string, now: number): { x: number; y: number } | undefined => {
    const held = heldRef.current;
    if (held && held.id === id) return { x: held.x, y: held.y };
    const lp = liveRef.current;
    if (lp) return lp.get(id);
    const a = anim.current;
    const to = targets.current.get(id);
    if (!a || !to) return to;
    const from = a.from.get(id) ?? to;
    const t = Math.min(1, (now - a.start) / motion.overviewSettle);
    const e = 1 - Math.pow(1 - t, 3); // ease-out
    return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
  };

  const requestDraw = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawRef.current();
    });
  };

  /** Fits the camera once per `fitKey`, as soon as there is something to fit. */
  const maybeFit = () => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || fittedFor.current === fitKeyRef.current) return;
    const lp = liveRef.current;
    const points = lp ? (lp.ready ? lp.all() : []) : modelRef.current.nodes;
    if (points.length === 0) return;
    cameraRef.current = fitCamera(
      unionRects(points.map((n) => ({ x: n.x, y: n.y, w: 0, h: 0 }))),
      w,
      h,
    );
    fittedFor.current = fitKeyRef.current;
  };

  // Keep the latest model/mode for the drawing code; My layout tweens to a new layout.
  useEffect(() => {
    const now = performance.now();
    const next = new Map<string, { x: number; y: number }>();
    const from = new Map<string, { x: number; y: number }>();
    for (const n of model.nodes) {
      next.set(n.id, { x: n.x, y: n.y });
      from.set(n.id, placeOf(n.id, now) ?? { x: n.homeX ?? n.x, y: n.homeY ?? n.y });
    }
    for (const hub of model.hubs) {
      const key = `hub:${hub.key}`;
      next.set(key, { x: hub.x, y: hub.y });
      from.set(key, placeOf(key, now) ?? { x: hub.x, y: hub.y });
    }
    const moves = [...next].some(([id, to]) => {
      const f = from.get(id);
      return !!f && Math.hypot(f.x - to.x, f.y - to.y) > 0.5;
    });
    targets.current = next;
    anim.current =
      !live && moves && !prefersReducedMotion() ? { start: now, from, to: next } : null;
    modelRef.current = model;
    modeRef.current = mode;
    focusRef.current = focusHubKey;
    liveRef.current = live;
    fitKeyRef.current = fitKey;
    maybeFit();
    requestDraw();
  }, [model, mode, focusHubKey, live, fitKey]);

  // A frame from the simulation: draw it.
  useEffect(() => {
    if (!live) return;
    return live.subscribe(requestDraw);
  }, [live]);

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
      maybeFit();
      // Clusters: nothing to show until the first positions arrive.
      if (liveRef.current && !liveRef.current.ready) return;

      const m = modelRef.current;
      const cam = cameraRef.current;
      const hover = hoverRef.current;
      const hoverStarKey = hoverStarRef.current;
      const now = performance.now();
      const settling =
        !liveRef.current &&
        anim.current !== null &&
        now - anim.current.start < motion.overviewSettle;
      if (anim.current && !settling) anim.current = null;
      const focusHub = focusRef.current
        ? m.hubs.find((hub) => hub.key === focusRef.current)
        : undefined;
      const hoverHub = hoverStarKey ? m.hubs.find((hub) => hub.key === hoverStarKey) : undefined;
      const focusMembers = focusHub ? new Set(focusHub.itemIds) : null;
      const point = new Map<string, { x: number; y: number }>();
      screenNodes.current = [];
      for (const n of m.nodes) {
        const at = placeOf(n.id, now) ?? n;
        const s = worldToScreen(cam, at.x, at.y, w, h);
        point.set(n.id, s);
        if (s.x > -40 && s.x < w + 40 && s.y > -40 && s.y < h + 40) {
          screenNodes.current.push({ id: n.id, x: s.x, y: s.y });
        }
      }
      screenHubs.current = [];
      for (const hub of m.hubs) {
        const at = placeOf(`hub:${hub.key}`, now) ?? hub;
        const s = worldToScreen(cam, at.x, at.y, w, h);
        point.set(hub.id, s);
        screenHubs.current.push({ key: hub.key, x: s.x, y: s.y });
      }

      // What the hovered dot or star touches stays bright; the rest dims to 30 %.
      const hoverId = hover ?? (hoverHub ? hoverHub.id : null);
      const near = new Set<string>();
      if (hoverId) {
        near.add(hoverId);
        for (const e of m.edges) {
          if (e.aId === hoverId) near.add(e.bId);
          else if (e.bId === hoverId) near.add(e.aId);
        }
      }

      // Edges first.
      for (const e of m.edges) {
        const a = point.get(e.aId);
        const b = point.get(e.bId);
        if (!a || !b) continue;
        const touches = hoverId !== null && (e.aId === hoverId || e.bId === hoverId);
        if (focusHub) {
          ctx.globalAlpha = e.aId === focusHub.id || e.bId === focusHub.id ? 0.9 : 0.05;
        } else
          ctx.globalAlpha = touches
            ? 0.9
            : hoverId
              ? e.manual
                ? HOVER_DIM_ALPHA * 0.5
                : 0.1
              : e.manual
                ? 0.9
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
        ctx.globalAlpha = focusMembers
          ? focusMembers.has(n.id)
            ? 1
            : FOCUS_FADE_ALPHA
          : hoverId && !near.has(n.id)
            ? HOVER_DIM_ALPHA
            : 1;
        if (!thumbs) {
          ctx.fillStyle = css(n.color);
          ctx.beginPath();
          ctx.arc(s.x, s.y, isHover ? 9 : DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const baseLong = Math.min(
          NODE_MAX_PX,
          Math.max(NODE_MIN_PX, NODE_WORLD_LONG_SIDE * cam.zoom),
        );
        const long = isHover ? Math.max(HOVER_LONG_SIDE, baseLong) : baseLong;
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
      for (const hub of m.hubs) {
        const s = point.get(hub.id);
        if (!s) continue;
        ctx.globalAlpha = focusHub
          ? hub === focusHub
            ? 1
            : FOCUS_FADE_ALPHA
          : hoverId && !near.has(hub.id)
            ? HOVER_DIM_ALPHA
            : 1;
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

      // A test aid: where the first drawn node is on screen.
      const sample = screenNodes.current[0];
      if (sample) {
        canvas!.dataset.sample = JSON.stringify({
          id: sample.id,
          x: Math.round(sample.x * 10) / 10,
          y: Math.round(sample.y * 10) / 10,
        });
      }

      const heldNow = heldRef.current;
      const heldPoint = heldNow ? point.get(heldNow.id) : undefined;
      if (heldNow && heldPoint) {
        canvas!.dataset.held = JSON.stringify({
          id: heldNow.id,
          x: Math.round(heldPoint.x * 10) / 10,
          y: Math.round(heldPoint.y * 10) / 10,
        });
      } else {
        delete canvas!.dataset.held;
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
      if (settling) requestDraw();
    }
    drawRef.current = draw;

    const resize = () => {
      sizeRef.current = { w: parent.clientWidth, h: parent.clientHeight };
      canvas.style.width = `${sizeRef.current.w}px`;
      canvas.style.height = `${sizeRef.current.h}px`;
      maybeFit();
      requestDraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    // --- interaction ---
    let drag: Drag | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const worldAt = (p: { x: number; y: number }) =>
      screenToWorld(cameraRef.current, p.x, p.y, sizeRef.current.w, sizeRef.current.h);
    const starAt = (p: { x: number; y: number }) =>
      screenHubs.current.find((st) => Math.hypot(st.x - p.x, st.y - p.y) <= STAR_HIT_PX);

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
      const p = local(e);
      if (liveRef.current) {
        // A dot or a star under the pointer is picked up; empty space still pans.
        const star = starAt(p);
        const id = star ? `hub:${star.key}` : nodeAt(screenNodes.current, p.x, p.y, HIT_RADIUS);
        if (id) {
          drag = { kind: 'node', id, startX: e.clientX, startY: e.clientY, moved: false };
          return;
        }
      }
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (drag?.kind === 'node') {
        if (
          !drag.moved &&
          Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD
        )
          return;
        drag.moved = true;
        const world = worldAt(local(e));
        heldRef.current = { id: drag.id, x: world.x, y: world.y };
        onDragRef.current(drag.id, world.x, world.y);
        canvas.style.cursor = 'grabbing';
        requestDraw();
        return;
      }
      if (drag?.kind === 'pan') {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        cameraRef.current = panBy(cameraRef.current, dx, dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        hoverRef.current = null;
        hoverStarRef.current = null;
        requestDraw();
        return;
      }
      const p = local(e);
      const star = starAt(p);
      const starKey = star ? star.key : null;
      const id = star ? null : nodeAt(screenNodes.current, p.x, p.y, HIT_RADIUS);
      if (id !== hoverRef.current || starKey !== hoverStarRef.current) {
        hoverRef.current = id;
        hoverStarRef.current = starKey;
        canvas.style.cursor = id || starKey ? (liveRef.current ? 'grab' : 'pointer') : 'grab';
        requestDraw();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.kind === 'node') {
        if (drag.moved) {
          onReleaseRef.current(drag.id);
          heldRef.current = null;
          canvas.style.cursor = 'grab';
          requestDraw();
        } else {
          const star = starAt(local(e));
          if (star) onFocusHubRef.current(focusRef.current === star.key ? null : star.key);
        }
      } else if (drag && !drag.moved) {
        // A plain click: a star focuses its group; empty space clears the focus.
        const p = local(e);
        const star = starAt(p);
        if (star) {
          onFocusHubRef.current(focusRef.current === star.key ? null : star.key);
        } else if (!nodeAt(screenNodes.current, p.x, p.y, HIT_RADIUS)) {
          if (focusRef.current) onFocusHubRef.current(null);
        }
      }
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => {
      if (hoverRef.current || hoverStarRef.current) {
        hoverRef.current = null;
        hoverStarRef.current = null;
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
