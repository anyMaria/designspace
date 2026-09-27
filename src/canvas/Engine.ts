// Our strict CSP has no 'unsafe-eval' (§4.12), so PixiJS can't use its default new-Function()
// shader/uniform sync. This polyfill installs the static fallback and must load before any
// renderer initializes — see node_modules/pixi.js/skills/pixijs-environments/SKILL.md.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import { Camera } from './Camera';
import { SpatialIndex } from './spatialIndex';
import { TextureManager } from './TextureManager';
import { attachCanvasInput, type Tool, type WheelMode } from './input';
import {
  hitTest,
  normalizeRect,
  rectSelect,
  resizeHandleAt,
  resizeWithAspect,
  type ResizeHandle,
} from './selection';
import { canvasGeometry } from '@/design/tokens';
import type { BenchRect } from '@/platform/seed/bench';
import { unionRects } from '@/lib/geometry';

export interface EngineOptions {
  getTool: () => Tool;
  getWheelMode: () => WheelMode;
}

export interface ItemCard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Packed 0xRRGGBB — the placeholder tint before a thumbnail loads, and the far-zoom flat
   * color — §3.4, §4.6 LOD table. */
  dominantColor: number;
  thumbUrl128: string | null;
  thumbUrl512: string | null;
}

interface EngineEvents {
  select: (ids: string[]) => void;
  move: (updates: { id: string; x: number; y: number }[]) => void;
  resize: (update: { id: string; x: number; y: number; w: number; h: number }) => void;
  dblclick: (id: string | null) => void;
  contextmenu: (id: string | null, screen: { x: number; y: number }) => void;
  hover: (id: string | null) => void;
}

const HANDLE_SCREEN_PX = 10;
const DRAG_THRESHOLD_PX = 3;

/**
 * The framework-agnostic canvas engine — §4.6. Owns the Pixi `Application`, the camera and
 * culling. React mounts it once in `<CanvasView>` and never re-renders per frame; everything
 * here is imperative.
 */
export class Engine {
  readonly camera = new Camera();

  private app: Application | null = null;
  private container: HTMLElement | null = null;
  private world: Container | null = null;
  private itemsLayer: Container | null = null;
  private overlayLayer: Container | null = null; // screen-space: marquee, selection outline, handles
  private rectContext: GraphicsContext | null = null;

  // Bench mode (spike S1 perf harness, §4.13) — flat colored rects only.
  private benchNodes = new Map<string, Graphics>();
  private benchIndex = new SpatialIndex();
  private benchVisible = new Set<string>();

  // Library items mode — real cards with LOD thumbnails.
  private cards = new Map<string, ItemCard>();
  private sprites = new Map<string, Sprite>();
  private itemIndex = new SpatialIndex();
  private itemVisible = new Set<string>();
  private textureManager: TextureManager<Texture> | null = null;

  // Search Dim/Hide (§2.8) — a null set means "no active filter, everything matches".
  private searchMatches: Set<string> | null = null;
  private searchMode: 'dim' | 'hide' = 'dim';
  // List panel group hover (§2.9) — takes priority over search alpha while set.
  private hoverHighlight: Set<string> | null = null;
  // Rediscover's pulse (§2.15) — cancels the running ticker callback, if any.
  private pulseStop: (() => void) | null = null;

  private selection = new Set<string>();
  private hoveredId: string | null = null;
  private marquee: Graphics | null = null;
  private selectionOutline: Graphics | null = null;
  private handles: Graphics[] = [];

  private detachInput: (() => void) | null = null;
  private detachSelectionInput: (() => void) | null = null;
  private unsubscribeCamera: (() => void) | null = null;
  private cullScheduled = false;

  private listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    select: new Set(),
    move: new Set(),
    resize: new Set(),
    dblclick: new Set(),
    contextmenu: new Set(),
    hover: new Set(),
  };

  on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void {
    this.listeners[event].add(handler);
    return () => this.listeners[event].delete(handler);
  }

  private emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void {
    for (const handler of this.listeners[event])
      (handler as (...a: Parameters<EngineEvents[K]>) => void)(...args);
  }

  async mount(container: HTMLElement, opts: EngineOptions): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0, // the dot grid is CSS behind the (transparent) canvas — §3.4
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(app.canvas);
    // Painted above the DotGrid's CSS layer (transparent background, so the dots show through
    // wherever there's no scene content) — §3.4.
    app.canvas.style.display = 'block';
    app.canvas.style.position = 'absolute';
    app.canvas.style.inset = '0';
    app.canvas.style.zIndex = '1';

    this.app = app;
    this.container = container;
    this.world = new Container();
    this.itemsLayer = new Container();
    this.world.addChild(this.itemsLayer);
    app.stage.addChild(this.world);
    this.overlayLayer = new Container();
    app.stage.addChild(this.overlayLayer);

    this.rectContext = new GraphicsContext().rect(0, 0, 1, 1).fill(0xffffff);
    this.textureManager = new TextureManager<Texture>({
      decode: async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        return Texture.from(bitmap);
      },
      destroyItem: (tex) => tex.destroy(true),
      maxConcurrentDecodes: 6,
      maxCachedItems: 300,
    });

    this.detachInput = attachCanvasInput(container, this.camera, {
      getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
      getTool: opts.getTool,
      getWheelMode: opts.getWheelMode,
    });
    this.detachSelectionInput = this.attachSelectionInput(container, opts);
    this.unsubscribeCamera = this.camera.subscribe(() => this.scheduleFrame());
    app.renderer.on('resize', () => this.scheduleFrame());
    this.scheduleFrame();
  }

  // ---------------------------------------------------------------- Bench mode (unchanged API)

  /** Replaces the whole scene with flat colored rectangles (bench mode — spike S1, §4.13). */
  setBenchRects(rects: BenchRect[]): void {
    if (!this.itemsLayer || !this.rectContext) return;
    this.clearItems();
    for (const node of this.benchNodes.values()) node.destroy();
    this.benchNodes.clear();

    for (const rect of rects) {
      const g = new Graphics(this.rectContext);
      g.tint = rect.color;
      g.position.set(rect.x, rect.y);
      g.scale.set(rect.w, rect.h);
      g.visible = false;
      g.renderable = false;
      this.itemsLayer.addChild(g);
      this.benchNodes.set(rect.id, g);
    }
    this.benchIndex.load(rects);
    this.benchVisible.clear();
    this.scheduleFrame();
  }

  clearScene(): void {
    for (const node of this.benchNodes.values()) node.destroy();
    this.benchNodes.clear();
    this.benchIndex.clear();
    this.benchVisible.clear();
    this.clearItems();
    this.itemsLayer?.removeChildren();
  }

  // ---------------------------------------------------------------------------- Library items

  /** Replaces the scene with real item cards — §4.6. Cheap to call on every store change: it
   * diffs against the previous set rather than tearing everything down. */
  setLibraryItems(cards: ItemCard[]): void {
    if (!this.itemsLayer) return;
    const next = new Map(cards.map((c) => [c.id, c]));

    for (const [id, sprite] of this.sprites) {
      if (!next.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const card of cards) {
      const existing = this.sprites.get(card.id);
      if (existing) {
        existing.position.set(card.x, card.y);
        existing.width = card.w;
        existing.height = card.h;
        existing.zIndex = card.z;
      } else {
        const sprite = new Sprite(Texture.WHITE);
        sprite.tint = card.dominantColor;
        sprite.position.set(card.x, card.y);
        sprite.width = card.w;
        sprite.height = card.h;
        sprite.zIndex = card.z;
        sprite.visible = false;
        sprite.renderable = false;
        this.itemsLayer.addChild(sprite);
        this.sprites.set(card.id, sprite);
      }
    }
    this.itemsLayer.sortableChildren = true;
    this.cards = next;
    this.itemIndex.load(cards);
    this.refreshAlpha();
    this.scheduleFrame();
  }

  /** Search Dim/Hide (§2.8): `matches` null clears the filter (everything normal again); a Set
   * restricts both what's paintable (Dim: 12% alpha; Hide: not rendered, handled in `cullItems`
   * alongside viewport culling so the two don't fight over `visible`/`renderable`) and what's
   * clickable/selectable (`interactableCards`, used by every hit-test call site below). */
  setSearchFilter(matches: Set<string> | null, mode: 'dim' | 'hide' = 'dim'): void {
    this.searchMatches = matches;
    this.searchMode = mode;
    this.refreshAlpha();
    this.scheduleFrame();
  }

  /** List panel group hover (§2.9 "makes its items glow... while the rest dims") — takes
   * priority over the search Dim/Hide alpha while active, so hovering a group previews it even
   * with a search filter on; clearing it (`null`) falls back to whatever the search filter says. */
  setHoverHighlight(ids: Set<string> | null): void {
    this.hoverHighlight = ids;
    this.refreshAlpha();
    this.scheduleFrame();
  }

  private refreshAlpha(): void {
    for (const [id, sprite] of this.sprites) sprite.alpha = this.alphaFor(id);
  }

  /** Rediscover's "make it pulse" (§2.15) — a brief alpha oscillation, not a selection outline
   * (which already exists and would look identical to any other selection). Only one pulse runs
   * at a time; a second call cancels the first rather than layering two tickers on one sprite. */
  pulseItem(id: string, durationMs = 1400): void {
    this.pulseStop?.();
    this.pulseStop = null;
    const sprite = this.sprites.get(id);
    if (!sprite || !this.app) return;

    const start = performance.now();
    const baseAlpha = this.alphaFor(id);
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) {
        sprite.alpha = this.alphaFor(id);
        this.app?.ticker.remove(tick);
        if (this.pulseStop === stop) this.pulseStop = null;
        return;
      }
      const phase = (elapsed / 220) * Math.PI;
      const wave = (Math.sin(phase) + 1) / 2; // 0..1
      sprite.alpha = baseAlpha * (0.4 + 0.6 * wave);
    };
    const stop = () => {
      this.app?.ticker.remove(tick);
      sprite.alpha = this.alphaFor(id);
    };
    this.pulseStop = stop;
    this.app.ticker.add(tick);
  }

  private alphaFor(id: string): number {
    if (this.hoverHighlight) return this.hoverHighlight.has(id) ? 1 : 0.12;
    const isMatch = !this.searchMatches || this.searchMatches.has(id);
    return isMatch || this.searchMode === 'hide' ? 1 : 0.12;
  }

  private interactableCards(): ItemCard[] {
    const all = [...this.cards.values()];
    if (!this.searchMatches) return all;
    return all.filter((c) => this.searchMatches!.has(c.id));
  }

  private clearItems(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.cards.clear();
    this.itemIndex.clear();
    this.itemVisible.clear();
    this.textureManager?.destroy();
  }

  // -------------------------------------------------------------------------------- Selection

  setSelection(ids: string[]): void {
    this.selection = new Set(ids);
    this.drawSelectionOverlay();
  }

  getSelection(): string[] {
    return [...this.selection];
  }

  /** Converts a `clientX`/`clientY` point (e.g. from a drop or paste event) into world
   * coordinates — used by the import entry points to land new items at the cursor (§2.3). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.app || !this.container) return null;
    const rect = this.container.getBoundingClientRect();
    const { width: vw, height: vh } = this.app.screen;
    return this.camera.screenToWorld(clientX - rect.left, clientY - rect.top, vw, vh);
  }

  /** The world point at the viewport center — the fallback drop point when the cursor is
   * outside the window (§2.3, paste). */
  viewportCenter(): { x: number; y: number } {
    return { x: this.camera.x, y: this.camera.y };
  }

  /** Screen-pixel viewport size — the minimap needs it to draw the viewport rectangle. */
  viewportSize(): { w: number; h: number } {
    return { w: this.app?.screen.width ?? 0, h: this.app?.screen.height ?? 0 };
  }

  /** Sets the camera position directly, no easing — the minimap's drag-to-navigate (§2.1). */
  panTo(x: number, y: number): void {
    this.camera.setPosition(x, y);
  }

  private attachSelectionInput(container: HTMLElement, opts: EngineOptions): () => void {
    let mode: 'idle' | 'marquee' | 'move' | 'resize' = 'idle';
    let startWorld = { x: 0, y: 0 };
    let startScreen = { x: 0, y: 0 };
    let moved = false;
    let resizeHandle: ResizeHandle | null = null;
    let resizeTargetId: string | null = null;
    let moveOrigin = new Map<string, { x: number; y: number }>();

    const viewport = () => ({ w: this.app?.screen.width ?? 0, h: this.app?.screen.height ?? 0 });
    const toWorld = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const { w, h } = viewport();
      return this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (opts.getTool() !== 'select' || e.button !== 0) return;
      const world = toWorld(e);
      startWorld = world;
      startScreen = { x: e.clientX, y: e.clientY };
      moved = false;

      // Resize handle on the current single-selection?
      if (this.selection.size === 1) {
        const id = [...this.selection][0];
        const card = this.cards.get(id);
        if (card) {
          const handle = resizeHandleAt(card, world, HANDLE_SCREEN_PX / this.camera.zoom);
          if (handle) {
            mode = 'resize';
            resizeHandle = handle;
            resizeTargetId = id;
            container.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const hit = hitTest(this.interactableCards(), world);
      if (hit) {
        if (!this.selection.has(hit.id)) {
          const additive = e.shiftKey;
          this.setSelection(additive ? [...this.selection, hit.id] : [hit.id]);
          this.emit('select', this.getSelection());
        } else if (e.shiftKey) {
          const next = new Set(this.selection);
          next.delete(hit.id);
          this.setSelection([...next]);
          this.emit('select', this.getSelection());
        }
        mode = 'move';
        moveOrigin = new Map(
          [...this.selection].map((id) => {
            const c = this.cards.get(id);
            return [id, { x: c?.x ?? 0, y: c?.y ?? 0 }];
          }),
        );
      } else {
        if (!e.shiftKey) {
          this.setSelection([]);
          this.emit('select', []);
        }
        mode = 'marquee';
      }
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (mode === 'idle') {
        const world = toWorld(e);
        const hit = hitTest(this.interactableCards(), world);
        if (hit?.id !== this.hoveredId) {
          this.hoveredId = hit?.id ?? null;
          this.emit('hover', this.hoveredId);
        }
        return;
      }
      const dx = e.clientX - startScreen.x;
      const dy = e.clientY - startScreen.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) moved = true;
      if (!moved) return;
      const world = toWorld(e);

      if (mode === 'marquee') {
        this.drawMarquee(normalizeRect(startWorld, world));
      } else if (mode === 'move') {
        const worldDx = world.x - startWorld.x;
        const worldDy = world.y - startWorld.y;
        for (const [id, origin] of moveOrigin) {
          const sprite = this.sprites.get(id);
          const card = this.cards.get(id);
          if (sprite && card) {
            sprite.position.set(origin.x + worldDx, origin.y + worldDy);
            card.x = origin.x + worldDx;
            card.y = origin.y + worldDy;
          }
        }
        this.drawSelectionOverlay();
      } else if (mode === 'resize' && resizeTargetId && resizeHandle) {
        const card = this.cards.get(resizeTargetId);
        const sprite = this.sprites.get(resizeTargetId);
        if (card && sprite) {
          const next = resizeWithAspect(card, resizeHandle, world);
          card.x = next.x;
          card.y = next.y;
          card.w = next.w;
          card.h = next.h;
          sprite.position.set(next.x, next.y);
          sprite.width = next.w;
          sprite.height = next.h;
          this.drawSelectionOverlay();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (mode === 'marquee' && moved) {
        const world = toWorld(e);
        const rect = normalizeRect(startWorld, world);
        const hits = rectSelect(this.interactableCards(), rect);
        this.setSelection(hits.map((h) => h.id));
        this.emit('select', this.getSelection());
        this.clearMarquee();
      } else if (mode === 'move' && moved) {
        const updates = [...this.selection].map((id) => {
          const c = this.cards.get(id);
          return { id, x: c?.x ?? 0, y: c?.y ?? 0 };
        });
        this.emit('move', updates);
      } else if (mode === 'resize' && moved && resizeTargetId) {
        const c = this.cards.get(resizeTargetId);
        if (c) this.emit('resize', { id: resizeTargetId, x: c.x, y: c.y, w: c.w, h: c.h });
      }
      mode = 'idle';
      resizeHandle = null;
      resizeTargetId = null;
      moveOrigin.clear();
      container.releasePointerCapture(e.pointerId);
    };

    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const { w, h } = viewport();
      const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
      const hit = hitTest(this.interactableCards(), world);
      this.emit('dblclick', hit?.id ?? null);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const { w, h } = viewport();
      const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
      const hit = hitTest(this.interactableCards(), world);
      if (hit && !this.selection.has(hit.id)) {
        this.setSelection([hit.id]);
        this.emit('select', this.getSelection());
      }
      this.emit('contextmenu', hit?.id ?? null, { x: e.clientX, y: e.clientY });
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('contextmenu', onContextMenu);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('contextmenu', onContextMenu);
    };
  }

  // ------------------------------------------------------------------------------- Stacking

  /** `]`/`[`/Ctrl+]/Ctrl+[ — §2.2. Returns the new z for each affected item so the caller can
   * persist it; the engine only reorders on screen. */
  bringForward(ids: string[], toFront: boolean): { id: string; z: number }[] {
    const maxZ = Math.max(0, ...[...this.cards.values()].map((c) => c.z));
    const updates = ids.map((id, i) => ({ id, z: maxZ + 1 + i }));
    if (!toFront) return this.sendBackward(ids);
    for (const { id, z } of updates) {
      const card = this.cards.get(id);
      const sprite = this.sprites.get(id);
      if (card) card.z = z;
      if (sprite) sprite.zIndex = z;
    }
    return updates;
  }

  sendBackward(ids: string[]): { id: string; z: number }[] {
    const minZ = Math.min(0, ...[...this.cards.values()].map((c) => c.z));
    const updates = ids.map((id, i) => ({ id, z: minZ - 1 - i }));
    for (const { id, z } of updates) {
      const card = this.cards.get(id);
      const sprite = this.sprites.get(id);
      if (card) card.z = z;
      if (sprite) sprite.zIndex = z;
    }
    return updates;
  }

  // --------------------------------------------------------------------------------- Overlay

  private drawMarquee(rect: { x: number; y: number; w: number; h: number }): void {
    if (!this.marquee) {
      this.marquee = new Graphics();
      this.overlayLayer?.addChild(this.marquee);
    }
    this.applyOverlayTransform(this.marquee, rect.x, rect.y);
    this.marquee.clear();
    this.marquee
      .rect(0, 0, rect.w * this.camera.zoom, rect.h * this.camera.zoom)
      .fill({ color: 0xefe6d6, alpha: 0.12 })
      .stroke({ color: 0xefe6d6, width: 1.5, alpha: 0.8 });
  }

  private clearMarquee(): void {
    this.marquee?.destroy();
    this.marquee = null;
  }

  private applyOverlayTransform(node: Container, worldX: number, worldY: number): void {
    if (!this.app) return;
    const { width: vw, height: vh } = this.app.screen;
    const screen = this.camera.worldToScreen(worldX, worldY, vw, vh);
    node.position.set(screen.x, screen.y);
  }

  private drawSelectionOverlay(): void {
    if (!this.overlayLayer || !this.app) return;
    this.selectionOutline?.destroy();
    this.selectionOutline = null;
    for (const h of this.handles) h.destroy();
    this.handles = [];

    const selected = [...this.selection]
      .map((id) => this.cards.get(id))
      .filter((c): c is ItemCard => !!c);
    if (selected.length === 0) return;

    for (const card of selected) {
      const outline = new Graphics();
      this.applyOverlayTransform(outline, card.x, card.y);
      const w = card.w * this.camera.zoom;
      const h = card.h * this.camera.zoom;
      outline
        .rect(0, 0, w, h)
        .stroke({ color: 0xefe6d6, width: canvasGeometry.selectionOutlinePx });
      this.overlayLayer.addChild(outline);
      this.handles.push(outline);
    }

    if (selected.length === 1) {
      const card = selected[0];
      const corners: [number, number][] = [
        [card.x, card.y],
        [card.x + card.w, card.y],
        [card.x, card.y + card.h],
        [card.x + card.w, card.y + card.h],
      ];
      for (const [wx, wy] of corners) {
        const handle = new Graphics();
        this.applyOverlayTransform(handle, wx, wy);
        handle.position.x -= HANDLE_SCREEN_PX / 2;
        handle.position.y -= HANDLE_SCREEN_PX / 2;
        handle.rect(0, 0, HANDLE_SCREEN_PX, HANDLE_SCREEN_PX).fill(0xefe6d6);
        this.overlayLayer.addChild(handle);
        this.handles.push(handle);
      }
    }
  }

  // ----------------------------------------------------------------------------- Camera / fly-to

  flyTo(rect: { x: number; y: number; w: number; h: number }, reduceMotion = false): void {
    if (!this.app) return;
    this.camera.flyTo(rect, this.app.screen.width, this.app.screen.height, reduceMotion);
  }

  /** The zoom menu's "Zoom to fit"/"Zoom to selection" (§2.1). */
  zoomToFit(reduceMotion = false): void {
    const bounds = unionRects(
      [...this.cards.values()].map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
    );
    if (bounds) this.flyTo(bounds, reduceMotion);
  }

  zoomToSelection(reduceMotion = false): void {
    this.zoomToIds([...this.selection], reduceMotion);
  }

  /** "Frame results" (§2.8) — zooms to fit an arbitrary id list, not just the selection. */
  zoomToIds(ids: string[], reduceMotion = false): void {
    const rects = ids
      .map((id) => this.cards.get(id))
      .filter((c): c is ItemCard => c !== undefined)
      .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    const bounds = unionRects(rects);
    if (bounds) this.flyTo(bounds, reduceMotion);
  }

  /** "100 %" / Shift+0 (§2.2). */
  zoomTo100(reduceMotion = false): void {
    this.camera.flyToZoom(1, reduceMotion);
  }

  /** Ctrl+=/Ctrl+− and the zoom menu's in/out buttons (§2.2). */
  zoomStep(factor: number, reduceMotion = false): void {
    this.camera.flyToZoom(this.camera.zoom * factor, reduceMotion);
  }

  private scheduleFrame(): void {
    if (this.cullScheduled) return;
    this.cullScheduled = true;
    requestAnimationFrame(() => {
      this.cullScheduled = false;
      this.applyCameraTransform();
      this.cullBench();
      this.cullItems();
      this.drawSelectionOverlay();
    });
  }

  private applyCameraTransform(): void {
    if (!this.app || !this.world) return;
    const { width: vw, height: vh } = this.app.screen;
    const { x, y, zoom } = this.camera.state;
    this.world.scale.set(zoom);
    this.world.position.set(vw / 2 - x * zoom, vh / 2 - y * zoom);
  }

  private cullBench(): void {
    if (!this.app || this.benchNodes.size === 0) return;
    const { width: vw, height: vh } = this.app.screen;
    const viewportRect = this.camera.viewportWorldRect(vw, vh, 0.2);
    const nextVisible = this.benchIndex.queryIds(viewportRect);
    for (const id of this.benchVisible) {
      if (!nextVisible.has(id)) {
        const node = this.benchNodes.get(id);
        if (node) {
          node.visible = false;
          node.renderable = false;
        }
      }
    }
    for (const id of nextVisible) {
      if (!this.benchVisible.has(id)) {
        const node = this.benchNodes.get(id);
        if (node) {
          node.visible = true;
          node.renderable = true;
        }
      }
    }
    this.benchVisible = nextVisible;
  }

  /** Toggles visible/renderable for library item sprites and requests the right LOD texture —
   * §4.6 (culling + the LOD table). */
  private cullItems(): void {
    if (!this.app || this.cards.size === 0) return;
    const { width: vw, height: vh } = this.app.screen;
    const viewportRect = this.camera.viewportWorldRect(vw, vh, 0.2);
    const nextVisible = this.itemIndex.queryIds(viewportRect);

    for (const id of this.itemVisible) {
      if (!nextVisible.has(id)) {
        const sprite = this.sprites.get(id);
        if (sprite) {
          sprite.visible = false;
          sprite.renderable = false;
        }
      }
    }
    const hiddenBySearch = (id: string) =>
      this.searchMode === 'hide' && !!this.searchMatches && !this.searchMatches.has(id);
    for (const id of nextVisible) {
      const sprite = this.sprites.get(id);
      const card = this.cards.get(id);
      if (!sprite || !card) continue;
      const hidden = hiddenBySearch(id);
      sprite.visible = !hidden;
      sprite.renderable = !hidden;
      if (!hidden && !this.itemVisible.has(id)) this.requestLod(card, sprite);
    }
    this.itemVisible = nextVisible;
  }

  private requestLod(card: ItemCard, sprite: Sprite): void {
    const longSideWorld = Math.max(card.w, card.h);
    const longSideScreen = longSideWorld * this.camera.zoom;
    if (longSideScreen < canvasGeometry.farZoomThresholdPx) return; // flat color is correct as-is

    const wantsT512 = longSideScreen > canvasGeometry.lod.t128Max;
    const url = wantsT512 ? card.thumbUrl512 : card.thumbUrl128;
    const key = wantsT512 ? `t512:${card.id}` : `t128:${card.id}`;
    if (!url || !this.textureManager) return;
    if (sprite.texture === this.textureManager.get(key)) return;

    void this.textureManager.request(key, url).then((texture) => {
      if (!texture || sprite.destroyed) return;
      sprite.texture = texture;
      sprite.tint = 0xffffff;
    });
  }

  get visibleCount(): number {
    return this.benchVisible.size + this.itemVisible.size;
  }

  get totalCount(): number {
    return this.benchNodes.size + this.cards.size;
  }

  destroy(): void {
    this.pulseStop?.();
    this.detachInput?.();
    this.detachSelectionInput?.();
    this.unsubscribeCamera?.();
    this.clearScene();
    this.clearMarquee();
    this.selectionOutline?.destroy();
    for (const h of this.handles) h.destroy();
    this.rectContext?.destroy();
    this.app?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    this.app = null;
    this.world = null;
    this.itemsLayer = null;
    this.overlayLayer = null;
    this.rectContext = null;
    this.textureManager = null;
  }
}
