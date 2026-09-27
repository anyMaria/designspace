// Our strict CSP has no 'unsafe-eval' (§4.12), so PixiJS can't use its default new-Function()
// shader/uniform sync. This polyfill installs the static fallback and must load before any
// renderer initializes — see node_modules/pixi.js/skills/pixijs-environments/SKILL.md.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, GraphicsContext } from 'pixi.js';
import { Camera } from './Camera';
import { SpatialIndex } from './spatialIndex';
import { attachCanvasInput, type Tool, type WheelMode } from './input';
import type { BenchRect } from '@/platform/seed/bench';

export interface EngineOptions {
  getTool: () => Tool;
  getWheelMode: () => WheelMode;
}

/**
 * The framework-agnostic canvas engine — §4.6. Owns the Pixi `Application`, the camera and
 * culling. React mounts it once in `<CanvasView>` and never re-renders per frame; everything
 * here is imperative.
 */
export class Engine {
  readonly camera = new Camera();

  private app: Application | null = null;
  private world: Container | null = null;
  private itemsLayer: Container | null = null;
  private rectContext: GraphicsContext | null = null;
  private nodes = new Map<string, Graphics>();
  private index = new SpatialIndex();
  private visible = new Set<string>();
  private detachInput: (() => void) | null = null;
  private unsubscribeCamera: (() => void) | null = null;
  private cullScheduled = false;

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
    this.world = new Container();
    this.itemsLayer = new Container();
    this.world.addChild(this.itemsLayer);
    app.stage.addChild(this.world);

    this.rectContext = new GraphicsContext().rect(0, 0, 1, 1).fill(0xffffff);

    this.detachInput = attachCanvasInput(container, this.camera, {
      getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
      getTool: opts.getTool,
      getWheelMode: opts.getWheelMode,
    });
    this.unsubscribeCamera = this.camera.subscribe(() => this.scheduleFrame());
    app.renderer.on('resize', () => this.scheduleFrame());
    this.scheduleFrame();
  }

  /** Replaces the whole scene with flat colored rectangles (bench mode — spike S1, §4.13). */
  setBenchRects(rects: BenchRect[]): void {
    if (!this.itemsLayer || !this.rectContext) return;
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.itemsLayer.removeChildren();

    for (const rect of rects) {
      const g = new Graphics(this.rectContext);
      g.tint = rect.color;
      g.position.set(rect.x, rect.y);
      g.scale.set(rect.w, rect.h);
      g.visible = false;
      g.renderable = false;
      this.itemsLayer.addChild(g);
      this.nodes.set(rect.id, g);
    }
    this.index.load(rects);
    this.visible.clear();
    this.scheduleFrame();
  }

  clearScene(): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.itemsLayer?.removeChildren();
    this.index.clear();
    this.visible.clear();
  }

  flyTo(rect: { x: number; y: number; w: number; h: number }, reduceMotion = false): void {
    if (!this.app) return;
    this.camera.flyTo(rect, this.app.screen.width, this.app.screen.height, reduceMotion);
  }

  private scheduleFrame(): void {
    if (this.cullScheduled) return;
    this.cullScheduled = true;
    requestAnimationFrame(() => {
      this.cullScheduled = false;
      this.applyCameraTransform();
      this.cull();
    });
  }

  private applyCameraTransform(): void {
    if (!this.app || !this.world) return;
    const { width: vw, height: vh } = this.app.screen;
    const { x, y, zoom } = this.camera.state;
    this.world.scale.set(zoom);
    this.world.position.set(vw / 2 - x * zoom, vh / 2 - y * zoom);
  }

  /** Toggles visible/renderable only for items whose membership changed — §4.6. */
  private cull(): void {
    if (!this.app) return;
    const { width: vw, height: vh } = this.app.screen;
    const viewportRect = this.camera.viewportWorldRect(vw, vh, 0.2);
    const nextVisible = this.index.queryIds(viewportRect);

    for (const id of this.visible) {
      if (!nextVisible.has(id)) {
        const node = this.nodes.get(id);
        if (node) {
          node.visible = false;
          node.renderable = false;
        }
      }
    }
    for (const id of nextVisible) {
      if (!this.visible.has(id)) {
        const node = this.nodes.get(id);
        if (node) {
          node.visible = true;
          node.renderable = true;
        }
      }
    }
    this.visible = nextVisible;
  }

  get visibleCount(): number {
    return this.visible.size;
  }

  get totalCount(): number {
    return this.nodes.size;
  }

  destroy(): void {
    this.detachInput?.();
    this.unsubscribeCamera?.();
    this.clearScene();
    this.rectContext?.destroy();
    this.app?.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    this.app = null;
    this.world = null;
    this.itemsLayer = null;
    this.rectContext = null;
  }
}
