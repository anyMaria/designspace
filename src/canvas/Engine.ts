// Our strict CSP has no 'unsafe-eval' (§4.12), so PixiJS can't use its default new-Function()
// shader/uniform sync. This polyfill installs the static fallback and must load before any
// renderer initializes — see node_modules/pixi.js/skills/pixijs-environments/SKILL.md.
import 'pixi.js/unsafe-eval';
import { cardAlpha, connectionRelatedSet } from './cardAlpha';
import { drawPalette, paletteDrawKey } from './decor/paletteDecor';
import { CRITERION_COLOR } from './criterionColor';
import { drawNotePaper, notePaperKey } from './decor/noteDecor';
import { paletteCellAt } from '@/lib/palette';
import { drawRelatedOutlines, type RelatedOutlineEntry } from '@/canvas/relatedOutline';
import { clipSegmentToBoxes, distanceToSegment, edgePoint } from '@/lib/lineAnchors';
import {
  Application,
  Assets,
  Container,
  Graphics,
  GraphicsContext,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type TextStyleOptions,
} from 'pixi.js';
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
import {
  canvasGeometry,
  colors,
  connectionLineStyle,
  criterionColors,
  fonts,
  noteGeometry,
  noteStyles,
  type NoteColor,
} from '@/design/tokens';
import type { BenchRect } from '@/platform/seed/bench';
import { rectsIntersect, unionRects, type Rect } from '@/lib/geometry';
import { CRITERION_ORDER, type Criterion, type Hub, type ScoredCandidate } from '@/lib/connections';
import { en } from '@/i18n/en';
import type { ItemKind, Frame } from '@/state/types';
import { noteTextColor } from '@/design/tokens';
import { exportRectForCards, type ExportBackground, type ExportScale } from '@/lib/exportGeometry';
import { formatDuration } from '@/lib/formatDuration';

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
   * color — §3.4, §4.6 LOD table. For a note, this is the note's own color token and never
   * changes to a thumbnail (notes have none). */
  dominantColor: number;
  thumbUrl128: string | null;
  thumbUrl512: string | null;
  kind: ItemKind;
  /** §2.11 — a note's plain-text content, drawn as a `Text` child of its card (see
   * `setLibraryItems`). Also doubles as a video's "can't play this" fallback message (§2.4) when
   * its ingest failed — `null` for every other case. */
  noteText: string | null;
  /** §2.11 — the frame this item's placement belongs to, if any (`placement.frameId`). Lets the
   * frame-drag interaction move a frame's contents along with it without Engine needing to know
   * about placements directly. */
  frameId: string | null;
  /** §2.4 video duration badge — `null` until ingest reports it (or for every non-video kind). */
  durationMs: number | null;
  /** §2.4 "Hovering (zoom ≥ 60%) plays a muted looping preview" — the *original* file's URL
   * (unlike `thumbUrl128/512`, a cached derivative), since the preview plays the real video, not
   * a still. `null` for every non-video kind, or before the original is available. */
  videoUrl: string | null;
  /** §2.4 PDF page-count badge — `null` until ingest reports it (or for every non-pdf kind). */
  pageCount: number | null;
  /** Patch 1 · C3: a swatch's/palette's colours (`#RRGGBB`) and optional name, drawn by
   * `decor/paletteDecor.ts`; `null` for every other kind. */
  swatchColors: string[] | null;
  swatchName: string | null;
  /** Patch 1 · D1: a note's paper colour (drives `decor/noteDecor.ts`); `null` for other kinds. */
  noteColor: NoteColor | null;
}

interface EngineEvents {
  select: (ids: string[]) => void;
  move: (updates: { id: string; x: number; y: number }[]) => void;
  resize: (update: { id: string; x: number; y: number; w: number; h: number }) => void;
  /** `world` is where the double-click landed, in canvas world coordinates — used to place a new
   * note when `id` is `null` (double-click on empty canvas, §2.11). */
  dblclick: (id: string | null, world: { x: number; y: number }) => void;
  /** A click on a colour cell of an already-selected palette (Patch 1 · C3). */
  swatchCellClick: (id: string, index: number) => void;
  /** The hover/selection connection lines changed (Patch 1 · G1): one entry per related pair, in
   * the colour of its strongest criterion. The minimap draws them. */
  connectionsChanged: (lines: { fromId: string; toId: string; color: number }[]) => void;
  contextmenu: (id: string | null, screen: { x: number; y: number }) => void;
  hover: (id: string | null) => void;
  /** A connection line was hovered (or un-hovered, `null`) — §2.10's "Hovering a line shows what
   * the two items share". */
  connectionLineHover: (
    info: { fromId: string; toId: string; shared: Partial<Record<Criterion, string[]>> } | null,
  ) => void;
  /** §2.10 "My connections": the drag handle was dropped on another item, or "Connect to…" 's
   * picked target was clicked — either way, the caller (which owns the store/command) decides
   * whether to actually create the connection (e.g. `isConnected` already true). */
  connectDrop: (fromId: string, toId: string) => void;
  /** A manual-criterion line/edge was double-clicked — "Double-click a line to add a label". */
  connectionLineDblClick: (pair: { fromId: string; toId: string }) => void;
  /** §2.11 frames — dragging the title moved it (and its contents) by this total delta; resizing
   * the handle changed its rect; double-clicking the title asks for a rename. Each fires once, on
   * release/double-click, not per pointermove — the drag itself is a live visual-only preview. */
  frameMove: (frameId: string, dx: number, dy: number) => void;
  frameResize: (frameId: string, rect: { x: number; y: number; w: number; h: number }) => void;
  frameRenameRequest: (frameId: string) => void;
}

const LINE_WIDTH_PX = connectionLineStyle.width;
const LINE_WIDTH_HOVERED_PX = connectionLineStyle.width + 1;
const LINE_OPACITY = connectionLineStyle.opacity;
const TEXTURE_RETRY_MS = 5000; // a texture that failed to load is retried once after this
const MAX_TEXTURE_ATTEMPTS = 2;
const LINE_GAP_PX = 6; // space between a picture's edge and the line that leaves it
const LINE_OFFSET_PX = 4; // spacing between up to 3 parallel lines for the same pair

/** A `Hub` (from `lib/connections.ts`) plus the display label the caller already resolved via
 * `formatHubLabel` — Engine stays free of term/item lookups, matching how `ScoredCandidate`'s
 * tooltip text is resolved by the caller rather than here. */
export interface ShowAllHub extends Hub {
  label: string;
}
const HUB_STAR_POINTS = 5;
const HUB_STAR_RADIUS_PX = 9;
const HUB_STAR_INNER_RADIUS_PX = 4;
const HUB_LINE_OPACITY = connectionLineStyle.hubOpacity;
const HUB_LINE_WIDTH_PX = connectionLineStyle.hubWidth;
const HUB_LABEL_FONT_SIZE = 11;

const CONNECT_HANDLE_RADIUS_PX = 6;
const CONNECT_HANDLE_HIT_PX = 12;
const DOUBLE_TAP_MS = 350;

const HANDLE_SCREEN_PX = 10;
/** Every canvas label uses the UI font; Pixi rasterises text once, so it must be loaded first
 * (CanvasView waits for it). */
/** `<b>`, `<i>` and `<dshash>` (a hashtag) in a note's tagged text (Patch 1 · D1). */
function noteTagStyles(hashtag: number): TextStyleOptions['tagStyles'] {
  return {
    b: { fontWeight: '700' },
    i: { fontStyle: 'italic' },
    dshash: { fill: hashtag, fontWeight: '700' },
  };
}

function uiTextStyle(overrides: TextStyleOptions): TextStyleOptions {
  return { fontFamily: fonts.ui, fontWeight: '500', ...overrides };
}

const DRAG_THRESHOLD_PX = 3;

// §2.11 note cards — the snippet is drawn in world units (a sibling of the sprite in
// `itemsLayer`, not its child — a child would stretch/scale with `sprite.width/height` and
// change font size as the card resizes, which a text snippet should never do).
const NOTE_TEXT_PADDING_WORLD = 14;
const NOTE_TEXT_FONT_SIZE_WORLD = 18;

// §2.4 corner badge (video duration / PDF page count) — bottom-right corner, world units for the
// same reason as the note snippet above.
const VIDEO_BADGE_PADDING_WORLD = 10;
// §2.4 "Hovering (zoom ≥ 60%) plays a muted looping preview" — the plan's own threshold.
const VIDEO_HOVER_ZOOM_THRESHOLD = 0.6;

// §2.11 frames — a dashed outline + a title label sitting just above the top-left corner (so it
// never overlaps whatever's placed inside), drawn in world units like the note/swatch labels.
const FRAME_LABEL_FONT_SIZE_WORLD = 16;
const FRAME_LABEL_GAP_WORLD = 6;
const FRAME_STROKE_WIDTH_WORLD = 2;
const FRAME_COLOR = 0xffffff;
const FRAME_RESIZE_HANDLE_SCREEN_PX = 10;

/** Standard relative-luminance contrast pick — dark text on a light swatch, white text on a
 * dark one. Only swatches need this (see `syncNoteLabel`'s doc comment); notes' 5 colors are all
 * light enough that a fixed dark ink always works. */
function readableTextColor(packedColor: number): number {
  const r = (packedColor >> 16) & 0xff;
  const g = (packedColor >> 8) & 0xff;
  const b = packedColor & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? noteTextColor : 0xffffff;
}

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
  private noteLabels = new Map<string, Text>(); // §2.11 — a note card's plain-text snippet
  // §2.4 — a video card's "▶ mm:ss" duration badge, or a PDF card's "PDF · N p" page-count badge.
  private cornerBadges = new Map<string, Text>();
  /** Cards that draw themselves (swatches/palettes now, notes in D1): their sprite is never shown,
   * this container is. Keyed by item id. */
  private decor = new Map<string, Container>();
  private decorKey = new Map<string, string>();
  /** A note's text is clipped to its paper by this mask (a child of its decor container). */
  private noteMasks = new Map<string, Graphics>();

  // §2.11 frames.
  private frames = new Map<string, Frame>();
  private frameGraphics = new Map<string, Graphics>();
  private frameLabels = new Map<string, Text>();
  private frameHandles = new Map<string, Graphics>();
  private selectedFrameId: string | null = null;
  private frameDragOrigin: { x: number; y: number } | null = null;
  private frameResizeOrigin: { x: number; y: number; w: number; h: number } | null = null;
  private frameMoveMemberOrigins = new Map<string, { x: number; y: number }>();
  private itemIndex = new SpatialIndex();
  private itemVisible = new Set<string>();
  private textureManager: TextureManager<Texture> | null = null;
  /** Card id → the texture key it currently shows (or is loading). Includes the URL, so a
   * re-made thumbnail is a new key. */
  private appliedTexKey = new Map<string, string>();

  // Search Dim/Hide (§2.8) — a null set means "no active filter, everything matches".
  private searchMatches: Set<string> | null = null;
  private searchMode: 'dim' | 'hide' = 'dim';
  // List panel group hover (§2.9) — takes priority over search alpha while set.
  private hoverHighlight: Set<string> | null = null;
  /** Who set `hoverHighlight`: a List/Actions panel row, or a hub star on the map. Hub stars are
   * re-created every frame so their `pointerout` never fires; see `recheckHubHighlight`. */
  private hoverHighlightSource: 'panel' | 'hub' | null = null;
  /** Last pointer position (screen px, relative to the container); null when it left the map. */
  private lastPointer: { x: number; y: number } | null = null;
  /** True while a card is being moved or resized: connection dimming pauses. */
  private dragging = false;
  // Rediscover's pulse (§2.15) — cancels the running ticker callback, if any.
  private pulseStop: (() => void) | null = null;
  // On-hover/selection connections (§2.10) — the "from" item(s) plus scored candidates to draw
  // lines to; unset (empty array) means no connections are showing right now.
  private connectionSources: { fromId: string; candidates: ScoredCandidate[] }[] = [];
  private connectionLineGraphics: Graphics[] = [];
  private texFailures = new Map<string, { attempts: number; at: number }>();
  private texRetryTimer: number | null = null;
  private hoveredConnectionLine: { fromId: string; toId: string } | null = null;
  // "Show all" mode (§2.10) — hubs plus their item-to-hub edges; unset (empty array) means
  // Show all isn't active right now (Hover mode owns `connectionSources` instead).
  private showAllHubs: ShowAllHub[] = [];
  private hubDisplayObjects: (Graphics | Text)[] = [];
  // "My connections" (§2.10) — the drag handle, "Connect to…" picking, and the click-to-select/
  // double-click-to-label interactions on a manual-criterion line or hub edge.
  private connectHandleGraphic: Graphics | null = null;
  private connectDragLine: Graphics | null = null;
  private connecting = false; // hides the static handle while a drag-out is in progress
  private pickingConnectFrom: string | null = null;
  /** "Pick from a photo" (Patch 1 · C4): the next click on a picture card reports where in it. */
  private pickingPoint: ((hit: { id: string; u: number; v: number } | null) => void) | null = null;
  private selectedConnectionPair: { fromId: string; toId: string } | null = null;
  private lastLineTapAt: { key: string; at: number } | null = null;
  private suppressNextEmptyDblClick = false;

  private selection = new Set<string>();
  private hoveredId: string | null = null;
  // §2.4 "Hovering (zoom ≥ 60%) plays a muted looping preview, one video at a time" — the id
  // currently showing a live video texture (rather than its poster thumbnail), and that texture's
  // source URL, needed to `Assets.unload` it when the preview stops.
  private videoPreviewId: string | null = null;
  private videoPreviewSrc: string | null = null;
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
    swatchCellClick: new Set(),
    connectionsChanged: new Set(),
    contextmenu: new Set(),
    hover: new Set(),
    connectionLineHover: new Set(),
    connectDrop: new Set(),
    connectionLineDblClick: new Set(),
    frameMove: new Set(),
    frameResize: new Set(),
    frameRenameRequest: new Set(),
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
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        return Texture.from(bitmap);
      },
      destroyItem: (tex, key) => {
        // A sprite still showing this texture goes back to its flat colour; the next cull reloads.
        const id = key.split(':')[1] ?? '';
        if (this.appliedTexKey.get(id) === key) {
          const sprite = this.sprites.get(id);
          const card = this.cards.get(id);
          if (sprite && !sprite.destroyed) {
            sprite.texture = Texture.WHITE;
            if (card) sprite.tint = card.dominantColor;
          }
          this.appliedTexKey.delete(id);
        }
        tex.destroy(true);
      },
      maxConcurrentDecodes: 6,
      maxCachedItems: 1500,
    });

    this.detachInput = attachCanvasInput(container, this.camera, {
      getViewport: () => ({ w: app.screen.width, h: app.screen.height }),
      getTool: opts.getTool,
      getWheelMode: opts.getWheelMode,
    });
    this.detachSelectionInput = this.attachSelectionInput(container, opts);
    this.unsubscribeCamera = this.camera.subscribe(() => {
      this.scheduleFrame();
      this.updateVideoPreview();
      this.scheduleTextResolution();
    });
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
        this.appliedTexKey.delete(id);
        this.removeDecor(id);
        const label = this.noteLabels.get(id);
        if (label) {
          label.destroy();
          this.noteLabels.delete(id);
        }
        const badge = this.cornerBadges.get(id);
        if (badge) {
          badge.destroy();
          this.cornerBadges.delete(id);
        }
      }
    }
    for (const card of cards) {
      const existing = this.sprites.get(card.id);
      if (existing) {
        existing.position.set(card.x, card.y);
        existing.width = card.w;
        existing.height = card.h;
        existing.zIndex = card.z;
        // A note's or swatch's tint IS its color (never overwritten by a loaded texture, since
        // neither ever gets one — see `requestLod`), so it must track `card.dominantColor` live
        // for the color picker/Extract palette to work. An image's tint is `requestLod`'s to own
        // once a real thumbnail loads (it sets it to white); re-asserting the placeholder tint
        // here on every unrelated store write would put a color cast back over an already-loaded
        // photo.
        if (card.kind === 'note' || card.kind === 'swatch') existing.tint = card.dominantColor;
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
      this.syncNoteLabel(card);
    }
    this.itemsLayer.sortableChildren = true;
    this.cards = next;
    this.itemIndex.load(cards);
    this.refreshAlpha();
    this.scheduleFrame();
  }

  private textResolutionTimer: number | null = null;
  private textResolutionStep = 1;

  /** Text sharpness when zoomed in (Patch 1 · D1.6): Pixi rasterises `Text` once at a fixed
   * resolution, so after the camera settles (150 ms) re-rasterise the world-space labels at
   * devicePixelRatio × 1, 2 or 4 (zoom ≤ 1, ≤ 2, more). */
  private scheduleTextResolution(): void {
    if (this.textResolutionTimer !== null) window.clearTimeout(this.textResolutionTimer);
    this.textResolutionTimer = window.setTimeout(() => {
      this.textResolutionTimer = null;
      const zoom = this.camera.zoom;
      const step = zoom <= 1 ? 1 : zoom <= 2 ? 2 : 4;
      if (step === this.textResolutionStep) return;
      this.textResolutionStep = step;
      this.applyTextResolution();
    }, 150);
  }

  private applyTextResolution(): void {
    const resolution = (window.devicePixelRatio || 1) * this.textResolutionStep;
    for (const label of this.noteLabels.values()) label.resolution = resolution;
    for (const badge of this.cornerBadges.values()) badge.resolution = resolution;
    for (const label of this.frameLabels.values()) label.resolution = resolution;
    this.scheduleFrame();
  }

  /** Whether this card draws itself through a decor container instead of its sprite. */
  private isSelfDrawn(card: ItemCard): boolean {
    return card.kind === 'swatch' || card.kind === 'note';
  }

  private removeDecor(id: string): void {
    const d = this.decor.get(id);
    if (!d) return;
    const label = this.noteLabels.get(id);
    if (label) label.mask = null; // the mask dies with the decor
    d.destroy({ children: true });
    this.decor.delete(id);
    this.decorKey.delete(id);
    this.noteMasks.delete(id);
  }

  /** Creates/moves/redraws/removes the decor of a self-drawn card. Position and z are cheap; the
   * contents are redrawn only when `paletteDrawKey` changes (colours, size, name, labels on/off). */
  private syncDecor(card: ItemCard): void {
    if (!this.itemsLayer) return;
    if (!this.isSelfDrawn(card)) {
      this.removeDecor(card.id);
      return;
    }
    const sprite = this.sprites.get(card.id);
    if (sprite) {
      sprite.visible = false; // the decor is what's shown
      sprite.renderable = false;
    }
    let decor = this.decor.get(card.id);
    if (!decor) {
      decor = new Container();
      decor.eventMode = 'none';
      decor.visible = false; // `cullItems` decides
      this.itemsLayer.addChild(decor);
      this.decor.set(card.id, decor);
    }
    decor.position.set(card.x, card.y);
    decor.zIndex = card.z;
    if (card.kind === 'note') {
      const color = card.noteColor ?? 'cream';
      const key = notePaperKey(card, color);
      if (this.decorKey.get(card.id) !== key) {
        this.noteMasks.set(card.id, drawNotePaper(decor, card, color));
        this.decorKey.set(card.id, key);
        const label = this.noteLabels.get(card.id);
        if (label) label.mask = this.noteMasks.get(card.id) ?? null;
      }
      return;
    }
    const spec = {
      w: card.w,
      h: card.h,
      colors: card.swatchColors ?? [],
      name: card.swatchName,
    };
    const key = paletteDrawKey(spec, this.camera.zoom);
    if (this.decorKey.get(card.id) !== key) {
      drawPalette(decor, spec, this.camera.zoom);
      this.decorKey.set(card.id, key);
    }
  }

  /** Creates/updates/removes a note or swatch card's plain-text snippet (§2.11), or a video/PDF/
   * font's "can't play/open/read this" fallback message (§2.4, when `card.noteText` is set) — see
   * the constants above for why it's a sibling `Text`, not a sprite child. A no-op for every other
   * card, and removes a stale label once a card stops needing one (kind never actually changes
   * post-creation, but a video/PDF/font's `noteText` does, the moment ingest finishes or fails).
   * Text color is fixed dark for notes (their 5 colors are all light pastels, §2.11's palette),
   * but computed everywhere else — an extracted/freely-set swatch color, or a video/PDF/font's
   * placeholder tint, can be anything, including near-black, where the fixed dark text would
   * vanish. */
  private syncNoteLabel(card: ItemCard): void {
    if (!this.itemsLayer) return;
    this.syncDecor(card);
    const wantsLabel =
      card.kind === 'note' ||
      ((card.kind === 'video' ||
        card.kind === 'pdf' ||
        card.kind === 'font' ||
        card.kind === 'link') &&
        !!card.noteText);
    if (!wantsLabel) {
      const stale = this.noteLabels.get(card.id);
      if (stale) {
        stale.destroy();
        this.noteLabels.delete(card.id);
      }
      return;
    }
    const isNote = card.kind === 'note';
    const pad = isNote ? noteGeometry.pad : NOTE_TEXT_PADDING_WORLD;
    const wrapWidth = Math.max(card.w - pad * 2, 1);
    const x = card.x + pad;
    const y = card.y + pad + (isNote ? noteGeometry.textOffsetY : 0);
    const style = isNote ? noteStyles[card.noteColor ?? 'cream'] : null;
    const fill = style ? style.text : readableTextColor(card.dominantColor);
    const existing = this.noteLabels.get(card.id);
    if (existing) {
      existing.text = card.noteText ?? '';
      existing.style.wordWrapWidth = wrapWidth;
      existing.style.fill = fill;
      if (style) existing.style.tagStyles = noteTagStyles(style.hashtag);
      existing.position.set(x, y);
      existing.zIndex = card.z + 0.5;
    } else {
      const label = new Text({
        text: card.noteText ?? '',
        style: uiTextStyle({
          fontSize: isNote ? noteGeometry.fontSize : NOTE_TEXT_FONT_SIZE_WORLD,
          ...(isNote ? { lineHeight: noteGeometry.lineHeight } : {}),
          fill,
          wordWrap: true,
          wordWrapWidth: wrapWidth,
          breakWords: true,
          ...(style ? { tagStyles: noteTagStyles(style.hashtag) } : {}),
        }),
      });
      label.position.set(x, y);
      label.zIndex = card.z + 0.5;
      label.eventMode = 'none'; // selection/drag hit-testing is geometry-based, not Pixi events
      label.resolution = (window.devicePixelRatio || 1) * this.textResolutionStep;
      this.itemsLayer.addChild(label);
      this.noteLabels.set(card.id, label);
    }
    const label = this.noteLabels.get(card.id);
    if (label) label.mask = isNote ? (this.noteMasks.get(card.id) ?? null) : null;
    this.syncCornerBadge(card);
  }

  /** The "▶ mm:ss" duration badge or "PDF · N p" page-count badge (§2.4) at a card's bottom-right
   * corner. Called from `syncNoteLabel` (same "diff on every card sync" shape, just a second
   * small `Text` sibling) — an unsupported video/PDF's fallback message never has a
   * duration/page-count (ingest never finished), so the two labels never overlap. */
  private syncCornerBadge(card: ItemCard): void {
    if (!this.itemsLayer) return;
    const text =
      card.kind === 'video' && card.durationMs !== null
        ? `▶ ${formatDuration(card.durationMs)}`
        : card.kind === 'pdf' && card.pageCount !== null
          ? `PDF · ${card.pageCount}p`
          : null;
    if (text === null) {
      const stale = this.cornerBadges.get(card.id);
      if (stale) {
        stale.destroy();
        this.cornerBadges.delete(card.id);
      }
      return;
    }
    const x = card.x + card.w - VIDEO_BADGE_PADDING_WORLD;
    const y = card.y + card.h - VIDEO_BADGE_PADDING_WORLD;
    const existing = this.cornerBadges.get(card.id);
    if (existing) {
      existing.text = text;
      existing.position.set(x, y);
      existing.zIndex = card.z + 0.5;
    } else {
      const badge = new Text({
        text,
        style: uiTextStyle({ fontSize: NOTE_TEXT_FONT_SIZE_WORLD, fill: 0xffffff }),
        anchor: { x: 1, y: 1 },
      });
      badge.position.set(x, y);
      badge.zIndex = card.z + 0.5;
      badge.eventMode = 'none';
      this.itemsLayer.addChild(badge);
      this.cornerBadges.set(card.id, badge);
    }
  }

  /** §2.11 frames — diffs against the previous set the same way `setLibraryItems` does for
   * cards. Frame graphics/labels/handles live in `itemsLayer` (world-space, so they pan/zoom
   * with the content they group) but at a large negative `zIndex` offset so they always render
   * behind every item, even one explicitly "sent to back" (which only zeroes its own z). */
  setFrames(frames: Frame[]): void {
    if (!this.itemsLayer) return;
    const next = new Map(frames.map((f) => [f.id, f]));

    for (const [id, graphic] of this.frameGraphics) {
      if (!next.has(id)) {
        graphic.destroy();
        this.frameGraphics.delete(id);
        this.frameLabels.get(id)?.destroy();
        this.frameLabels.delete(id);
        this.frameHandles.get(id)?.destroy();
        this.frameHandles.delete(id);
        if (this.selectedFrameId === id) this.selectedFrameId = null;
      }
    }
    this.frames = next;
    for (const frame of frames) this.drawFrame(frame);
    this.scheduleFrame();
  }

  private drawFrame(frame: Frame): void {
    if (!this.itemsLayer) return;
    const zIndex = frame.z - 1_000_000;
    const selected = this.selectedFrameId === frame.id;

    let graphic = this.frameGraphics.get(frame.id);
    if (!graphic) {
      graphic = new Graphics();
      this.itemsLayer.addChild(graphic);
      this.frameGraphics.set(frame.id, graphic);
    }
    graphic.clear();
    graphic
      .rect(frame.x, frame.y, frame.w, frame.h)
      .stroke({ width: FRAME_STROKE_WIDTH_WORLD, color: FRAME_COLOR, alpha: selected ? 1 : 0.4 });
    graphic.zIndex = zIndex;

    let label = this.frameLabels.get(frame.id);
    const labelY = frame.y - FRAME_LABEL_FONT_SIZE_WORLD - FRAME_LABEL_GAP_WORLD;
    if (!label) {
      label = new Text({
        text: frame.title,
        style: uiTextStyle({ fontSize: FRAME_LABEL_FONT_SIZE_WORLD, fill: FRAME_COLOR }),
      });
      label.eventMode = 'none'; // hit-tested manually (screen-space rect), not via Pixi events
      this.itemsLayer.addChild(label);
      this.frameLabels.set(frame.id, label);
    }
    label.text = frame.title || en.frames.untitled;
    label.position.set(frame.x, labelY);
    label.zIndex = zIndex + 0.5;
    label.alpha = selected ? 1 : 0.7;

    let handle = this.frameHandles.get(frame.id);
    if (selected) {
      if (!handle) {
        handle = new Graphics();
        this.itemsLayer.addChild(handle);
        this.frameHandles.set(frame.id, handle);
      }
      const r = FRAME_RESIZE_HANDLE_SCREEN_PX / 2 / this.camera.zoom || 1;
      handle.clear();
      handle
        .rect(frame.x + frame.w - r, frame.y + frame.h - r, r * 2, r * 2)
        .fill({ color: FRAME_COLOR });
      handle.zIndex = zIndex + 0.5;
    } else if (handle) {
      handle.destroy();
      this.frameHandles.delete(frame.id);
    }
  }

  getSelectedFrameId(): string | null {
    return this.selectedFrameId;
  }

  setSelectedFrameId(id: string | null): void {
    this.selectedFrameId = id;
    for (const frame of this.frames.values()) this.drawFrame(frame);
    this.scheduleFrame();
  }

  /** Screen-space rect of a frame's title label — used both to hit-test a click/drag on it and,
   * live during a drag, to redraw it without waiting for a store round-trip. */
  private frameTitleScreenRect(
    frame: Frame,
  ): { x: number; y: number; w: number; h: number } | null {
    if (!this.app) return null;
    const { width: vw, height: vh } = this.app.screen;
    const worldY = frame.y - FRAME_LABEL_FONT_SIZE_WORLD - FRAME_LABEL_GAP_WORLD;
    const topLeft = this.camera.worldToScreen(frame.x, worldY, vw, vh);
    const label = this.frameLabels.get(frame.id);
    const textWidth = label ? label.width : frame.w * this.camera.zoom;
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: Math.max(textWidth, 40),
      h: FRAME_LABEL_FONT_SIZE_WORLD * this.camera.zoom + FRAME_LABEL_GAP_WORLD,
    };
  }

  private frameAtScreenPoint(
    clientX: number,
    clientY: number,
    left: number,
    top: number,
  ): Frame | null {
    const sx = clientX - left;
    const sy = clientY - top;
    for (const frame of this.frames.values()) {
      const rect = this.frameTitleScreenRect(frame);
      if (rect && sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
        return frame;
      }
    }
    return null;
  }

  private frameResizeHandleAt(
    clientX: number,
    clientY: number,
    left: number,
    top: number,
  ): Frame | null {
    if (!this.app || !this.selectedFrameId) return null;
    const frame = this.frames.get(this.selectedFrameId);
    if (!frame) return null;
    const { width: vw, height: vh } = this.app.screen;
    const corner = this.camera.worldToScreen(frame.x + frame.w, frame.y + frame.h, vw, vh);
    const sx = clientX - left;
    const sy = clientY - top;
    const hit = FRAME_RESIZE_HANDLE_SCREEN_PX;
    if (Math.abs(sx - corner.x) <= hit && Math.abs(sy - corner.y) <= hit) return frame;
    return null;
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
  setHoverHighlight(ids: Set<string> | null, source: 'panel' | 'hub' = 'panel'): void {
    this.hoverHighlight = ids;
    this.hoverHighlightSource = ids ? source : null;
    this.refreshAlpha();
    this.scheduleFrame();
  }

  /** On-hover/selection connection lines (§2.10). `sources` is usually one entry (the hovered
   * item) or several (every selected item, each already restricted to its co-selected
   * candidates by the caller — `restrictToSelection` in `lib/connections.ts`). An empty array
   * clears the lines and the connections-dim alpha. */
  setConnections(sources: { fromId: string; candidates: ScoredCandidate[] }[]): void {
    this.connectionSources = sources;
    this.refreshAlpha();
    this.scheduleFrame();
    const lines: { fromId: string; toId: string; color: number }[] = [];
    for (const { fromId, candidates } of sources) {
      for (const c of candidates) {
        const criterion = CRITERION_ORDER.find((k) => (c.shared[k]?.length ?? 0) > 0);
        if (criterion) lines.push({ fromId, toId: c.id, color: CRITERION_COLOR[criterion] });
      }
    }
    this.emit('connectionsChanged', lines);
  }

  /** "Show all" mode (§2.10). Unlike Hover, Show all doesn't dim unrelated items — the plan only
   * describes dimming for Hover, and hub hover already reuses `setHoverHighlight` (below) for its
   * own "makes its items glow" moment, the same mechanism the List panel's group hover uses. */
  setShowAllHubs(hubs: ShowAllHub[]): void {
    this.showAllHubs = hubs;
    this.scheduleFrame();
  }

  /** Context menu → "Connect to…" (§2.10): the next item click completes the connection
   * (`connectDrop`) instead of selecting it; clicking empty canvas or the source item itself
   * cancels. */
  startConnectPick(fromId: string): void {
    this.pickingConnectFrom = fromId;
    if (this.container) this.container.style.cursor = 'crosshair';
  }

  /** The next click on an image/video/PDF/link card calls back with the card and the click position
   * inside it (`u`, `v` in 0–1); a click anywhere else calls back with `null`. */
  startPointPick(cb: (hit: { id: string; u: number; v: number } | null) => void): void {
    this.pickingPoint = cb;
    if (this.container) this.container.style.cursor = 'crosshair';
  }

  cancelPointPick(): void {
    this.pickingPoint = null;
    if (this.container) this.container.style.cursor = '';
  }

  cancelConnectPick(): void {
    this.pickingConnectFrom = null;
    if (this.container) this.container.style.cursor = '';
  }

  getSelectedConnectionPair(): { fromId: string; toId: string } | null {
    return this.selectedConnectionPair;
  }

  setSelectedConnectionPair(pair: { fromId: string; toId: string } | null): void {
    this.selectedConnectionPair = pair;
    this.scheduleFrame();
  }

  private refreshAlpha(): void {
    const related = connectionRelatedSet(this.connectionSources);
    for (const id of this.sprites.keys()) this.setCardAlpha(id, this.alphaFor(id, related));
  }

  /** Every display object that belongs to a card (its picture, note label, corner badge), so a
   * faded card never keeps dark text on a dark card. */
  private forEachCardVisual(id: string, fn: (visual: Container) => void): void {
    const sprite = this.sprites.get(id);
    if (sprite) fn(sprite);
    const decor = this.decor.get(id);
    if (decor) fn(decor);
    const label = this.noteLabels.get(id);
    if (label) fn(label);
    const badge = this.cornerBadges.get(id);
    if (badge) fn(badge);
  }

  private setCardAlpha(id: string, alpha: number): void {
    this.forEachCardVisual(id, (v) => {
      v.alpha = alpha;
    });
  }

  /** Rediscover's "make it pulse" (§2.15) — a brief alpha oscillation, not a selection outline
   * (which already exists and would look identical to any other selection). Only one pulse runs
   * at a time; a second call cancels the first rather than layering two tickers on one sprite. */
  pulseItem(id: string, durationMs = 1400): void {
    this.pulseStop?.();
    this.pulseStop = null;
    if (!this.sprites.has(id) || !this.app) return;

    const start = performance.now();
    const baseAlpha = this.alphaFor(id);
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) {
        this.setCardAlpha(id, this.alphaFor(id));
        this.app?.ticker.remove(tick);
        if (this.pulseStop === stop) this.pulseStop = null;
        return;
      }
      const phase = (elapsed / 220) * Math.PI;
      const wave = (Math.sin(phase) + 1) / 2; // 0..1
      this.setCardAlpha(id, baseAlpha * (0.4 + 0.6 * wave));
    };
    const stop = () => {
      this.app?.ticker.remove(tick);
      this.setCardAlpha(id, this.alphaFor(id));
    };
    this.pulseStop = stop;
    this.app.ticker.add(tick);
  }

  private alphaFor(
    id: string,
    related: Set<string> | null = connectionRelatedSet(this.connectionSources),
  ): number {
    return cardAlpha(
      id,
      {
        hoverHighlight: this.hoverHighlight,
        searchMatches: this.searchMatches,
        searchMode: this.searchMode,
        suppressConnectionDim: this.dragging,
      },
      related,
    );
  }

  private interactableCards(): ItemCard[] {
    const all = [...this.cards.values()];
    if (!this.searchMatches) return all;
    return all.filter((c) => this.searchMatches!.has(c.id));
  }

  private clearItems(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.appliedTexKey.clear();
    this.texFailures.clear();
    for (const d of this.decor.values()) d.destroy({ children: true });
    this.decor.clear();
    this.decorKey.clear();
    for (const label of this.noteLabels.values()) label.destroy();
    this.noteLabels.clear();
    for (const badge of this.cornerBadges.values()) badge.destroy();
    this.cornerBadges.clear();
    this.cards.clear();
    this.itemIndex.clear();
    this.itemVisible.clear();
    this.textureManager?.destroy();
    for (const graphic of this.frameGraphics.values()) graphic.destroy();
    this.frameGraphics.clear();
    for (const label of this.frameLabels.values()) label.destroy();
    this.frameLabels.clear();
    for (const handle of this.frameHandles.values()) handle.destroy();
    this.frameHandles.clear();
    this.frames.clear();
    this.selectedFrameId = null;
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

  /** Screen position of an item's "My connections" drag handle (§2.10: "a small connect handle
   * on its right edge") — shared by the handle's own hit-test, its drag line, and its static
   * rendering in `drawConnectHandle`. */
  private connectHandleScreenPos(id: string): { x: number; y: number } | null {
    if (!this.app) return null;
    const card = this.cards.get(id);
    if (!card) return null;
    const { width: vw, height: vh } = this.app.screen;
    return this.camera.worldToScreen(card.x + card.w, card.y + card.h / 2, vw, vh);
  }

  private attachSelectionInput(container: HTMLElement, opts: EngineOptions): () => void {
    let mode: 'idle' | 'marquee' | 'move' | 'resize' | 'connect' | 'frame-move' | 'frame-resize' =
      'idle';
    let frameDragTotal = { dx: 0, dy: 0 };
    let startWorld = { x: 0, y: 0 };
    let startScreen = { x: 0, y: 0 };
    let moved = false;
    // The card pressed on, and whether it was already selected before this press: a plain click
    // on a colour cell of an already-selected palette copies that colour (C3).
    let pressed: { id: string; wasSelected: boolean } | null = null;
    let resizeHandle: ResizeHandle | null = null;
    let resizeTargetId: string | null = null;
    let moveOrigin = new Map<string, { x: number; y: number }>();
    let connectFromId: string | null = null;

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

      // Picking a colour from a photo overrides normal click behaviour too.
      if (this.pickingPoint) {
        const cb = this.pickingPoint;
        this.cancelPointPick();
        const hit = hitTest(this.interactableCards(), world);
        const isPicture = hit && ['image', 'video', 'pdf', 'link'].includes(hit.kind);
        cb(
          hit && isPicture
            ? { id: hit.id, u: (world.x - hit.x) / hit.w, v: (world.y - hit.y) / hit.h }
            : null,
        );
        container.setPointerCapture(e.pointerId);
        return;
      }

      // Picking a "Connect to…" target overrides normal click behavior entirely.
      if (this.pickingConnectFrom) {
        const fromId = this.pickingConnectFrom;
        this.pickingConnectFrom = null;
        if (this.container) this.container.style.cursor = '';
        const hit = hitTest(this.interactableCards(), world);
        if (hit && hit.id !== fromId) this.emit('connectDrop', fromId, hit.id);
        container.setPointerCapture(e.pointerId);
        return;
      }

      // The connect handle on the currently-hovered item's right edge?
      if (this.hoveredId) {
        const pos = this.connectHandleScreenPos(this.hoveredId);
        if (pos) {
          const rect = container.getBoundingClientRect();
          const dx = e.clientX - (rect.left + pos.x);
          const dy = e.clientY - (rect.top + pos.y);
          if (Math.hypot(dx, dy) <= CONNECT_HANDLE_HIT_PX) {
            mode = 'connect';
            connectFromId = this.hoveredId;
            this.connecting = true;
            container.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // The resize handle on the currently-selected frame?
      {
        const rect = container.getBoundingClientRect();
        const frame = this.frameResizeHandleAt(e.clientX, e.clientY, rect.left, rect.top);
        if (frame) {
          mode = 'frame-resize';
          this.frameResizeOrigin = { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
          container.setPointerCapture(e.pointerId);
          return;
        }
      }

      // A frame's title label — click selects it, drag moves it (and its contents).
      {
        const rect = container.getBoundingClientRect();
        const frame = this.frameAtScreenPoint(e.clientX, e.clientY, rect.left, rect.top);
        if (frame) {
          this.setSelection([]);
          this.emit('select', []);
          this.setSelectedFrameId(frame.id);
          mode = 'frame-move';
          this.frameDragOrigin = { x: frame.x, y: frame.y };
          frameDragTotal = { dx: 0, dy: 0 };
          this.frameMoveMemberOrigins = new Map(
            [...this.cards.values()]
              .filter((c) => c.frameId === frame.id)
              .map((c) => [c.id, { x: c.x, y: c.y }]),
          );
          container.setPointerCapture(e.pointerId);
          return;
        }
      }

      // Resize handle on the current single-selection?
      if (this.selection.size === 1) {
        const id = [...this.selection][0];
        const card = this.cards.get(id);
        if (card && card.kind !== 'swatch') {
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
      pressed = hit ? { id: hit.id, wasSelected: this.selection.has(hit.id) } : null;
      if (hit) {
        if (this.selectedFrameId) this.setSelectedFrameId(null);
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
        this.setSelectedConnectionPair(null);
        if (this.selectedFrameId) this.setSelectedFrameId(null);
        mode = 'marquee';
        // Capture is deferred to the first real move (below), not taken here: a plain click that
        // misses every item (e.g. on a connection line or hub star, which aren't `ItemCard`s and
        // so always land in this branch) must NOT capture the pointer, or the native pointerup
        // that follows gets routed to `container` instead of the canvas — silently swallowing
        // Pixi's own click handling for that line/star (its tooltip still works, since hover is
        // driven by pointermove, but `pointertap` never fires). Marquee dragging still captures
        // once it's clearly a drag, so it stays robust to the pointer leaving the canvas.
        return;
      }
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const crect = container.getBoundingClientRect();
      this.lastPointer = { x: e.clientX - crect.left, y: e.clientY - crect.top };
      if (mode === 'idle') {
        // The pointer is on the map, so it can't be on a List row any more.
        if (this.hoverHighlightSource === 'panel') this.setHoverHighlight(null);
        const world = toWorld(e);
        const hit = hitTest(this.interactableCards(), world);
        if (hit?.id !== this.hoveredId) {
          this.hoveredId = hit?.id ?? null;
          this.emit('hover', this.hoveredId);
          this.drawConnectHandle();
          this.updateVideoPreview();
        }
        return;
      }
      const dx = e.clientX - startScreen.x;
      const dy = e.clientY - startScreen.y;
      const justStartedMoving = !moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
      if (justStartedMoving) {
        moved = true;
        if (mode === 'move' || mode === 'resize') {
          this.dragging = true; // no connection dimming while dragging
          this.refreshAlpha();
        }
      }
      if (!moved) return;
      if (justStartedMoving && mode === 'marquee') container.setPointerCapture(e.pointerId);
      const world = toWorld(e);

      if (mode === 'marquee') {
        this.drawMarquee(normalizeRect(startWorld, world));
      } else if (mode === 'connect' && connectFromId) {
        const fromPos = this.connectHandleScreenPos(connectFromId);
        if (fromPos) {
          const rect = container.getBoundingClientRect();
          this.drawConnectDragLine(fromPos, {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        }
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
            this.syncNoteLabel(card);
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
          this.syncNoteLabel(card);
          this.drawSelectionOverlay();
        }
      } else if (mode === 'frame-move' && this.frameDragOrigin) {
        const frame = this.selectedFrameId ? this.frames.get(this.selectedFrameId) : null;
        if (frame) {
          const worldDx = world.x - startWorld.x;
          const worldDy = world.y - startWorld.y;
          frameDragTotal = { dx: worldDx, dy: worldDy };
          frame.x = this.frameDragOrigin.x + worldDx;
          frame.y = this.frameDragOrigin.y + worldDy;
          this.drawFrame(frame);
          for (const [id, origin] of this.frameMoveMemberOrigins) {
            const sprite = this.sprites.get(id);
            const card = this.cards.get(id);
            if (sprite && card) {
              sprite.position.set(origin.x + worldDx, origin.y + worldDy);
              card.x = origin.x + worldDx;
              card.y = origin.y + worldDy;
              this.syncNoteLabel(card);
            }
          }
        }
      } else if (mode === 'frame-resize' && this.frameResizeOrigin && this.selectedFrameId) {
        const frame = this.frames.get(this.selectedFrameId);
        if (frame) {
          const o = this.frameResizeOrigin;
          frame.w = Math.max(40, o.w + (world.x - startWorld.x));
          frame.h = Math.max(40, o.h + (world.y - startWorld.y));
          this.drawFrame(frame);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.dragging) {
        this.dragging = false;
        this.refreshAlpha();
      }
      if (mode === 'marquee' && moved) {
        const world = toWorld(e);
        const rect = normalizeRect(startWorld, world);
        const hits = rectSelect(this.interactableCards(), rect);
        this.setSelection(hits.map((h) => h.id));
        this.emit('select', this.getSelection());
        this.clearMarquee();
      } else if (mode === 'move' && !moved && pressed?.wasSelected) {
        const card = this.cards.get(pressed.id);
        if (card?.kind === 'swatch' && card.swatchColors && card.swatchColors.length >= 1) {
          const cell = paletteCellAt(card.swatchColors.length, card, toWorld(e));
          if (cell !== null) this.emit('swatchCellClick', card.id, cell);
        }
      } else if (mode === 'move' && moved) {
        const updates = [...this.selection].map((id) => {
          const c = this.cards.get(id);
          return { id, x: c?.x ?? 0, y: c?.y ?? 0 };
        });
        this.emit('move', updates);
      } else if (mode === 'resize' && moved && resizeTargetId) {
        const c = this.cards.get(resizeTargetId);
        if (c) this.emit('resize', { id: resizeTargetId, x: c.x, y: c.y, w: c.w, h: c.h });
      } else if (mode === 'connect' && connectFromId) {
        const world = toWorld(e);
        const hit = hitTest(this.interactableCards(), world);
        this.clearConnectDragLine();
        if (hit && hit.id !== connectFromId) this.emit('connectDrop', connectFromId, hit.id);
      } else if (mode === 'frame-move' && moved && this.selectedFrameId) {
        this.emit('frameMove', this.selectedFrameId, frameDragTotal.dx, frameDragTotal.dy);
      } else if (mode === 'frame-resize' && moved && this.selectedFrameId) {
        const frame = this.frames.get(this.selectedFrameId);
        if (frame) {
          this.emit('frameResize', this.selectedFrameId, {
            x: frame.x,
            y: frame.y,
            w: frame.w,
            h: frame.h,
          });
        }
      }
      mode = 'idle';
      resizeHandle = null;
      resizeTargetId = null;
      connectFromId = null;
      this.connecting = false;
      this.frameDragOrigin = null;
      this.frameResizeOrigin = null;
      this.frameMoveMemberOrigins.clear();
      this.drawConnectHandle();
      moveOrigin.clear();
      container.releasePointerCapture(e.pointerId);
    };

    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const frameHit = this.frameAtScreenPoint(e.clientX, e.clientY, rect.left, rect.top);
      if (frameHit) {
        this.emit('frameRenameRequest', frameHit.id);
        return;
      }
      const { w, h } = viewport();
      const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
      const hit = hitTest(this.interactableCards(), world);
      if (!hit && this.suppressNextEmptyDblClick) {
        this.suppressNextEmptyDblClick = false;
        return;
      }
      this.suppressNextEmptyDblClick = false;
      this.emit('dblclick', hit?.id ?? null, world);
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
    const onPointerLeave = () => {
      this.lastPointer = null;
      if (this.hoverHighlightSource === 'hub') this.setHoverHighlight(null, 'hub');
      if (this.hoveredConnectionLine) {
        this.hoveredConnectionLine = null;
        this.emit('connectionLineHover', null);
        this.scheduleFrame();
      }
      if (this.hoveredId !== null) {
        this.hoveredId = null;
        this.emit('hover', null);
        this.drawConnectHandle();
        this.updateVideoPreview();
      }
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('contextmenu', onContextMenu);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
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

  /** §2.10 "hover an item to reveal a small connect handle on its right edge" — a static dot,
   * redrawn whenever the hovered item changes (not every scheduled frame, since nothing else
   * moves it). Hidden while a drag-out is in progress so it doesn't sit under the cursor. */
  private drawConnectHandle(): void {
    if (!this.overlayLayer) return;
    this.connectHandleGraphic?.destroy();
    this.connectHandleGraphic = null;
    if (this.connecting || !this.hoveredId) return;
    const pos = this.connectHandleScreenPos(this.hoveredId);
    if (!pos) return;
    const g = new Graphics()
      .circle(pos.x, pos.y, CONNECT_HANDLE_RADIUS_PX)
      .fill({ color: 0xffffff, alpha: 0.95 })
      .stroke({ color: 0x000000, alpha: 0.2, width: 1 });
    g.eventMode = 'static';
    g.cursor = 'pointer';
    this.overlayLayer.addChild(g);
    this.connectHandleGraphic = g;
  }

  private drawConnectDragLine(from: { x: number; y: number }, to: { x: number; y: number }): void {
    if (!this.overlayLayer) return;
    if (!this.connectDragLine) {
      this.connectDragLine = new Graphics();
      this.overlayLayer.addChild(this.connectDragLine);
    }
    this.connectDragLine
      .clear()
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: criterionColors.manual, width: LINE_WIDTH_HOVERED_PX, alpha: LINE_OPACITY });
  }

  private clearConnectDragLine(): void {
    this.connectDragLine?.destroy();
    this.connectDragLine = null;
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

    if (selected.length === 1 && selected[0].kind !== 'swatch') {
      // Swatches and palettes size themselves, so they get no resize handles.
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

  /** Up to 3 parallel, slightly offset lines per related pair (§2.10), colored by criterion.
   * Screen-space, redrawn every scheduled frame alongside the selection overlay so panning/
   * zooming keeps them attached to their items without a separate camera subscription.
   * Deviation logged in docs/DECISIONS.md: Pixi's core `Graphics` has no dashed-stroke primitive,
   * so `criterionLineStyle`'s dotted/dashed distinction isn't drawn — every line is solid,
   * distinguished by its criterion color only. */
  /** Shared by a manual-criterion line (Hover mode) and a manual hub edge (Show all): single tap
   * selects the pair ("select the line and press Delete"), a second tap within `DOUBLE_TAP_MS`
   * on the same pair is a double-click ("double-click a line to add a label"). */
  private handleManualLineTap(fromId: string, toId: string): void {
    const key = [fromId, toId].sort().join('|');
    const now = performance.now();
    if (this.lastLineTapAt?.key === key && now - this.lastLineTapAt.at < DOUBLE_TAP_MS) {
      this.lastLineTapAt = null;
      // The two real clicks that just double-tapped this line also produce a native browser
      // `dblclick` on the container itself (Pixi's own `pointertap` doesn't stop that bubbling).
      // Since the line isn't a "card", `onDblClick`'s own hit-test comes up empty and would
      // otherwise read as "double-click on empty canvas" — §2.11's "create a note there" — right
      // on top of the line being labeled. Suppress that one `dblclick` emission.
      this.suppressNextEmptyDblClick = true;
      this.emit('connectionLineDblClick', { fromId, toId });
      return;
    }
    this.lastLineTapAt = { key, at: now };
    this.setSelectedConnectionPair({ fromId, toId });
  }

  private isSelectedConnectionPair(fromId: string, toId: string): boolean {
    if (!this.selectedConnectionPair) return false;
    const key = [fromId, toId].sort().join('|');
    return (
      [this.selectedConnectionPair.fromId, this.selectedConnectionPair.toId].sort().join('|') ===
      key
    );
  }

  private drawConnectionLines(): void {
    if (!this.overlayLayer || !this.app) return;
    for (const g of this.connectionLineGraphics) g.destroy();
    this.connectionLineGraphics = [];
    if (this.connectionSources.length === 0) {
      this.recheckHoveredLine(null);
      return;
    }

    const { width: vw, height: vh } = this.app.screen;
    const boxScreen = (card: ItemCard) => {
      const tl = this.camera.worldToScreen(card.x, card.y, vw, vh);
      return { x: tl.x, y: tl.y, w: card.w * this.camera.zoom, h: card.h * this.camera.zoom };
    };

    const seenPairs = new Set<string>();
    const relatedEntries = new Map<string, RelatedOutlineEntry>();
    let hoveredSegment: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
    for (const { fromId, candidates } of this.connectionSources) {
      const fromCard = this.cards.get(fromId);
      if (!fromCard) continue;
      const fromBox = boxScreen(fromCard);

      for (const candidate of candidates) {
        const pairKey = [fromId, candidate.id].sort().join('|');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const toCard = this.cards.get(candidate.id);
        if (!toCard) continue;
        // Lines stop at the edge of each picture, on the side facing the other one (B4);
        // pictures so close that the clipped line would point backwards get no line.
        const clipped = clipSegmentToBoxes(fromBox, boxScreen(toCard), LINE_GAP_PX);
        if (!clipped) continue;
        const fromScreen = clipped.from;
        const toScreen = clipped.to;
        const criteria = (Object.keys(candidate.shared) as Criterion[])
          .filter((c) => (candidate.shared[c]?.length ?? 0) > 0)
          .sort((a, b) => CRITERION_ORDER.indexOf(a) - CRITERION_ORDER.indexOf(b))
          .slice(0, 3);
        if (criteria.length === 0) continue;
        // The relationship shows as an outline on the related card even when its line is too
        // short to draw (touching cards).
        relatedEntries.set(candidate.id, {
          box: boxScreen(toCard),
          color: CRITERION_COLOR[criteria[0]],
        });
        if (
          Math.hypot(toScreen.x - fromScreen.x, toScreen.y - fromScreen.y) <
          connectionLineStyle.minVisiblePx
        )
          continue;

        const dx = toScreen.x - fromScreen.x;
        const dy = toScreen.y - fromScreen.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const isHoveredPair =
          this.hoveredConnectionLine?.fromId === fromId &&
          this.hoveredConnectionLine?.toId === candidate.id;
        const isSelectedPair = this.isSelectedConnectionPair(fromId, candidate.id);
        if (isHoveredPair) hoveredSegment = { a: fromScreen, b: toScreen };

        criteria.forEach((criterion, i) => {
          const offset = (i - (criteria.length - 1) / 2) * LINE_OFFSET_PX;
          const ox = nx * offset;
          const oy = ny * offset;
          const isManual = criterion === 'manual';

          const halo = new Graphics()
            .moveTo(fromScreen.x + ox, fromScreen.y + oy)
            .lineTo(toScreen.x + ox, toScreen.y + oy)
            .stroke({
              color: 0x000000,
              width: connectionLineStyle.haloWidth,
              alpha: connectionLineStyle.haloAlpha,
            });
          this.overlayLayer!.addChild(halo);
          this.connectionLineGraphics.push(halo);

          const line = new Graphics();
          line
            .moveTo(fromScreen.x + ox, fromScreen.y + oy)
            .lineTo(toScreen.x + ox, toScreen.y + oy)
            .stroke({
              color: CRITERION_COLOR[criterion],
              width:
                isHoveredPair || (isManual && isSelectedPair)
                  ? LINE_WIDTH_HOVERED_PX
                  : LINE_WIDTH_PX,
              alpha: LINE_OPACITY,
            });
          line.eventMode = 'static';
          line.cursor = 'pointer';
          line.on('pointerover', () => {
            this.hoveredConnectionLine = { fromId, toId: candidate.id };
            this.emit('connectionLineHover', {
              fromId,
              toId: candidate.id,
              shared: candidate.shared,
            });
            this.scheduleFrame();
          });
          line.on('pointerout', () => {
            this.hoveredConnectionLine = null;
            this.emit('connectionLineHover', null);
            this.scheduleFrame();
          });
          if (isManual) {
            line.on('pointertap', () => this.handleManualLineTap(fromId, candidate.id));
          }

          this.overlayLayer!.addChild(line);
          this.connectionLineGraphics.push(line);
        });
      }
    }
    this.connectionLineGraphics.push(
      ...drawRelatedOutlines(this.overlayLayer, [...relatedEntries.values()]),
    );
    this.recheckHoveredLine(hoveredSegment);
  }

  /** Lines are re-created every frame, so a hovered line's `pointerout` can be lost. Drop the
   * hover when the pointer is no longer near the line's new position (the slack covers the
   * up-to-3 parallel offset lines). */
  private recheckHoveredLine(
    segment: { a: { x: number; y: number }; b: { x: number; y: number } } | null,
  ): void {
    if (!this.hoveredConnectionLine) return;
    const p = this.lastPointer;
    const near =
      !!p && !!segment && distanceToSegment(p, segment.a, segment.b) <= 6 + LINE_OFFSET_PX;
    if (near) return;
    this.hoveredConnectionLine = null;
    this.emit('connectionLineHover', null);
  }

  /** Stars are re-created every frame, so their `pointerout` never fires when they move away or
   * disappear: clear a hub highlight unless the pointer is still on one of the stars just drawn. */
  private recheckHubHighlight(stars: { x: number; y: number; r: number }[]): void {
    if (this.hoverHighlightSource !== 'hub') return;
    const p = this.lastPointer;
    const stillOver = !!p && stars.some((st) => Math.hypot(p.x - st.x, p.y - st.y) <= st.r);
    if (!stillOver) this.setHoverHighlight(null, 'hub');
  }

  /** §2.10/§4.9 Show all: a labeled star per hub at the centroid of its member items' current
   * world positions, with a faint line from each member to its hub (n lines, not n²). Uses Pixi's
   * native `Graphics.star()` — unlike the dashed-line case, there's no missing-primitive
   * deviation to log here. Hovering a hub reuses `setHoverHighlight` for the "its items glow"
   * moment, the same mechanism the List panel's own group hover already uses. */
  private drawHubs(): void {
    if (!this.overlayLayer || !this.app) return;
    for (const g of this.hubDisplayObjects) g.destroy();
    this.hubDisplayObjects = [];
    const stars: { x: number; y: number; r: number }[] = [];
    if (this.showAllHubs.length === 0) {
      this.recheckHubHighlight(stars);
      return;
    }

    const { width: vw, height: vh } = this.app.screen;
    const screenCenterOf = (id: string) => {
      const card = this.cards.get(id);
      if (!card) return null;
      return this.camera.worldToScreen(card.x + card.w / 2, card.y + card.h / 2, vw, vh);
    };
    const screenBoxOf = (id: string) => {
      const card = this.cards.get(id);
      if (!card) return null;
      const tl = this.camera.worldToScreen(card.x, card.y, vw, vh);
      return { x: tl.x, y: tl.y, w: card.w * this.camera.zoom, h: card.h * this.camera.zoom };
    };

    for (const hub of this.showAllHubs) {
      const members = hub.itemIds
        .map((id) => ({ id, pos: screenCenterOf(id) }))
        .filter((m): m is { id: string; pos: { x: number; y: number } } => m.pos !== null);
      if (members.length < 2) continue;

      const hx = members.reduce((sum, m) => sum + m.pos.x, 0) / members.length;
      const hy = members.reduce((sum, m) => sum + m.pos.y, 0) / members.length;
      const color = CRITERION_COLOR[hub.criterion];
      const isManual = hub.criterion === 'manual';

      for (const member of members) {
        // A manual hub's "value" IS the connected item's own id (see `computeHubs`), so each
        // edge here is exactly one manual connection: member <-> hub.value.
        const isSelected = isManual && this.isSelectedConnectionPair(member.id, hub.value);
        // The edge leaves the picture at its edge (B4) and stops short of the star.
        const box = screenBoxOf(member.id);
        const dirLen = Math.hypot(hx - member.pos.x, hy - member.pos.y);
        if (!box || dirLen === 0) continue;
        const start = edgePoint(box, { x: hx, y: hy }, LINE_GAP_PX);
        const ux = (hx - member.pos.x) / dirLen;
        const uy = (hy - member.pos.y) / dirLen;
        const end = {
          x: hx - ux * (HUB_STAR_RADIUS_PX + 2),
          y: hy - uy * (HUB_STAR_RADIUS_PX + 2),
        };
        const visibleLen = (end.x - start.x) * ux + (end.y - start.y) * uy;
        if (visibleLen < connectionLineStyle.minVisiblePx) continue; // no stubs
        const edgeHalo = new Graphics()
          .moveTo(start.x, start.y)
          .lineTo(end.x, end.y)
          .stroke({
            color: 0x000000,
            width: connectionLineStyle.haloWidth,
            alpha: connectionLineStyle.haloAlpha * (HUB_LINE_OPACITY / LINE_OPACITY),
          });
        this.overlayLayer.addChild(edgeHalo);
        this.hubDisplayObjects.push(edgeHalo);
        const edge = new Graphics()
          .moveTo(start.x, start.y)
          .lineTo(end.x, end.y)
          .stroke({
            color,
            width: isSelected ? LINE_WIDTH_HOVERED_PX : HUB_LINE_WIDTH_PX,
            alpha: HUB_LINE_OPACITY,
          });
        if (isManual) {
          edge.eventMode = 'static';
          edge.cursor = 'pointer';
          edge.on('pointertap', () => this.handleManualLineTap(member.id, hub.value));
        }
        this.overlayLayer.addChild(edge);
        this.hubDisplayObjects.push(edge);
      }

      const star = new Graphics()
        .star(hx, hy, HUB_STAR_POINTS, HUB_STAR_RADIUS_PX, HUB_STAR_INNER_RADIUS_PX)
        .fill({ color, alpha: 0.9 });
      star.eventMode = 'static';
      star.cursor = 'pointer';
      const memberSet = new Set(hub.itemIds);
      star.on('pointerover', () => this.setHoverHighlight(memberSet, 'hub'));
      star.on('pointerout', () => this.setHoverHighlight(null, 'hub'));
      this.overlayLayer.addChild(star);
      this.hubDisplayObjects.push(star);
      stars.push({ x: hx, y: hy, r: HUB_STAR_RADIUS_PX });

      const label = new Text({
        text: hub.label,
        style: uiTextStyle({ fontSize: HUB_LABEL_FONT_SIZE, fill: 0xffffff }),
      });
      label.anchor.set(0.5, 0);
      label.x = hx;
      label.y = hy + HUB_STAR_RADIUS_PX + 2;
      this.overlayLayer.addChild(label);
      this.hubDisplayObjects.push(label);
    }
    this.recheckHubHighlight(stars);
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
      this.drawConnectionLines();
      this.drawHubs();
      this.drawConnectHandle();
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
        const label = this.noteLabels.get(id);
        if (label) label.visible = false;
        const badge = this.cornerBadges.get(id);
        if (badge) badge.visible = false;
        const decor = this.decor.get(id);
        if (decor) decor.visible = false;
      }
    }
    const hiddenBySearch = (id: string) =>
      this.searchMode === 'hide' && !!this.searchMatches && !this.searchMatches.has(id);
    for (const id of nextVisible) {
      const sprite = this.sprites.get(id);
      const card = this.cards.get(id);
      if (!sprite || !card) continue;
      const hidden = hiddenBySearch(id);
      const selfDrawn = this.isSelfDrawn(card);
      sprite.visible = !hidden && !selfDrawn;
      sprite.renderable = !hidden && !selfDrawn;
      const label = this.noteLabels.get(id);
      if (label) label.visible = !hidden;
      const badge = this.cornerBadges.get(id);
      if (badge) badge.visible = !hidden;
      if (selfDrawn) {
        this.syncDecor(card); // zoom may have crossed the hex-label threshold
        const decor = this.decor.get(id);
        if (decor) decor.visible = !hidden;
        continue;
      }
      // Every pass, not just on first sight: pictures that finish later must appear, and zooming
      // in must swap in the sharper thumbnail.
      if (!hidden) this.requestLod(card, sprite);
    }
    this.itemVisible = nextVisible;
  }

  /** The screen-space rect a card currently occupies — used by `NoteEditor` (§2.11) to position
   * the TipTap DOM overlay exactly over a note while it's being edited. */
  getScreenRect(id: string): { x: number; y: number; w: number; h: number } | null {
    if (!this.app) return null;
    const card = this.cards.get(id);
    if (!card) return null;
    const { width: vw, height: vh } = this.app.screen;
    const topLeft = this.camera.worldToScreen(card.x, card.y, vw, vh);
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: card.w * this.camera.zoom,
      h: card.h * this.camera.zoom,
    };
  }

  // ------------------------------------------------------------------------------- §2.11 Export

  /** The world-space rect a PNG/PDF export renders: a single frame's own rect, or the padded
   * bounding box of every card in the current space. `null` when there's nothing to export. */
  getExportRect(frameId: string | null): Rect | null {
    if (frameId) {
      const frame = this.frames.get(frameId);
      return frame ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h } : null;
    }
    return exportRectForCards([...this.cards.values()]);
  }

  /** Renders `rect` (world space) to an off-screen canvas at `scale`× — the shared step behind
   * both PNG export and each page of a PDF export. Temporarily un-culls every card in `rect`
   * (culling only keeps what's on *screen* renderable — §4.6 — which the export rect usually
   * exceeds) and upgrades their textures to the largest one this app caches (t512 — there's no
   * t1600/original path yet, see DECISIONS.md), then restores normal culling afterwards so the
   * live canvas is unaffected. */
  async renderExportCanvas(
    rect: Rect,
    opts: { scale: ExportScale; background: ExportBackground },
  ): Promise<HTMLCanvasElement> {
    if (!this.app || !this.itemsLayer) throw new Error('Engine not mounted');
    this.forceVisibleForExport(rect);
    await this.upgradeTexturesForExport(rect);
    const background = this.buildExportBackground(rect, opts.background);
    if (background) {
      background.zIndex = -Infinity;
      this.itemsLayer.addChild(background);
      this.itemsLayer.sortChildren();
    }
    try {
      return this.app.renderer.extract.canvas({
        target: this.itemsLayer,
        frame: new Rectangle(rect.x, rect.y, rect.w, rect.h),
        resolution: opts.scale,
        antialias: true,
      }) as HTMLCanvasElement;
    } finally {
      if (background) {
        this.itemsLayer.removeChild(background);
        background.destroy();
      }
      this.cullItems(); // recomputes real on-screen visibility from the current viewport
    }
  }

  /** Cards outside the current viewport are `renderable = false` (§4.6 culling) — make every
   * card the export rect covers paintable again, respecting an active search Hide filter (a
   * hidden-by-search item should stay out of the export too). `cullItems()` undoes this. */
  private forceVisibleForExport(rect: Rect): void {
    const hiddenBySearch = (id: string) =>
      this.searchMode === 'hide' && !!this.searchMatches && !this.searchMatches.has(id);
    for (const [id, card] of this.cards) {
      if (!rectsIntersect(rect, card) || hiddenBySearch(id)) continue;
      const sprite = this.sprites.get(id);
      if (sprite) {
        // A self-drawn card shows its decor, never a flat rectangle under it.
        sprite.visible = !this.isSelfDrawn(card);
        sprite.renderable = !this.isSelfDrawn(card);
      }
      const decor = this.decor.get(id);
      if (decor) decor.visible = true;
      const label = this.noteLabels.get(id);
      if (label) label.visible = true;
      const badge = this.cornerBadges.get(id);
      if (badge) badge.visible = true;
    }
  }

  private async upgradeTexturesForExport(rect: Rect): Promise<void> {
    if (!this.textureManager) return;
    const jobs: Promise<void>[] = [];
    for (const [id, card] of this.cards) {
      if (card.kind !== 'image' || !rectsIntersect(rect, card)) continue;
      const sprite = this.sprites.get(id);
      const url = card.thumbUrl512;
      if (!sprite || !url) continue;
      const key = `t512:${id}:${url}`;
      if (sprite.texture === this.textureManager.get(key)) continue;
      jobs.push(
        this.textureManager.request(key, url).then((texture) => {
          if (texture && !sprite.destroyed) {
            sprite.texture = texture;
            sprite.tint = 0xffffff;
            this.appliedTexKey.set(id, key);
          }
        }),
      );
    }
    await Promise.all(jobs);
  }

  /** "Plain plum"/"white" is a solid fill; "dots" adds the bullet-journal grid (§3.4) on top, at
   * its base world spacing — export always renders at "real" scale, unlike the on-screen CSS
   * grid's zoom-based density switching. */
  private buildExportBackground(rect: Rect, background: ExportBackground): Graphics | null {
    if (background === 'white')
      return new Graphics().rect(rect.x, rect.y, rect.w, rect.h).fill(0xffffff);
    const g = new Graphics().rect(rect.x, rect.y, rect.w, rect.h).fill(colors.canvas);
    if (background === 'plum') return g;
    const spacing = canvasGeometry.dotGridWorldSpacing;
    const startX = Math.floor(rect.x / spacing) * spacing;
    const startY = Math.floor(rect.y / spacing) * spacing;
    for (let x = startX; x < rect.x + rect.w; x += spacing) {
      for (let y = startY; y < rect.y + rect.h; y += spacing) {
        g.circle(x, y, canvasGeometry.dotScreenPx).fill({
          color: colors.dot,
          alpha: colors.dotAlpha,
        });
      }
    }
    return g;
  }

  /** Which texture a card should show right now, or null to keep whatever it shows (far zoom
   * draws the flat colour; no thumbnail yet means the placeholder tint stays). The key contains
   * the URL, so a re-made thumbnail (new URL) is a new key and gets loaded. */
  private desiredTexture(card: ItemCard): { key: string; url: string } | null {
    const longSideScreen = Math.max(card.w, card.h) * this.camera.zoom;
    if (longSideScreen < canvasGeometry.farZoomThresholdPx) return null;
    const wantsT512 = longSideScreen > canvasGeometry.lod.t128Max;
    const url = wantsT512
      ? (card.thumbUrl512 ?? card.thumbUrl128)
      : (card.thumbUrl128 ?? card.thumbUrl512);
    if (!url) return null;
    return { key: `${wantsT512 ? 't512' : 't128'}:${card.id}:${url}`, url };
  }

  private requestLod(card: ItemCard, sprite: Sprite): void {
    if (!this.textureManager) return;
    const want = this.desiredTexture(card);
    if (!want) return;
    if (this.appliedTexKey.get(card.id) === want.key) {
      this.textureManager.touch(want.key); // keep on-screen textures out of LRU eviction
      return;
    }
    const failed = this.texFailures.get(want.key);
    if (
      failed &&
      (failed.attempts >= MAX_TEXTURE_ATTEMPTS || performance.now() - failed.at < TEXTURE_RETRY_MS)
    )
      return;
    this.appliedTexKey.set(card.id, want.key); // also marks "in flight": no duplicate requests
    void this.textureManager.request(want.key, want.url).then((texture) => {
      if (!texture) {
        // Failed: keep the placeholder and try once more after a pause; after that, only a new
        // URL (re-ingest bumps thumb_v) retries.
        this.texFailures.set(want.key, {
          attempts: (failed?.attempts ?? 0) + 1,
          at: performance.now(),
        });
        if (this.appliedTexKey.get(card.id) === want.key) this.appliedTexKey.delete(card.id);
        this.texRetryTimer ??= window.setTimeout(() => {
          this.texRetryTimer = null;
          this.scheduleFrame();
        }, TEXTURE_RETRY_MS);
        return;
      }
      this.texFailures.delete(want.key);
      if (sprite.destroyed || this.appliedTexKey.get(card.id) !== want.key) return; // superseded
      sprite.texture = texture;
      sprite.tint = 0xffffff;
    });
  }

  /** Starts/stops the hovered card's muted looping video preview to match "Hovering (zoom ≥
   * 60%)" (§2.4) — called on every hover change and every camera change (zooming past the
   * threshold mid-hover should react too). A no-op if nothing actually needs to change, so it's
   * cheap to call opportunistically rather than threading a dirty flag through both call sites. */
  private updateVideoPreview(): void {
    const card = this.hoveredId ? this.cards.get(this.hoveredId) : undefined;
    const wantsPreview =
      !!card &&
      card.kind === 'video' &&
      !!card.videoUrl &&
      this.camera.zoom >= VIDEO_HOVER_ZOOM_THRESHOLD;
    const nextId = wantsPreview ? card.id : null;
    if (nextId === this.videoPreviewId) return;
    this.stopVideoPreview();
    if (nextId && card?.videoUrl) void this.startVideoPreview(nextId, card.videoUrl);
  }

  private async startVideoPreview(id: string, url: string): Promise<void> {
    this.videoPreviewId = id;
    this.videoPreviewSrc = url;
    try {
      const texture = await Assets.load<Texture>({
        src: url,
        data: { autoPlay: true, loop: true, muted: true, playsinline: true },
      });
      if (this.videoPreviewId !== id) return; // hover moved on while this was loading
      const sprite = this.sprites.get(id);
      if (sprite && !sprite.destroyed) {
        this.appliedTexKey.delete(id); // so stopVideoPreview → requestLod restores the poster
        sprite.texture = texture;
      }
    } catch {
      // Playback failed (e.g. a codec this browser can't decode) — leave the poster thumbnail
      // showing rather than surfacing an error for what's just a preview.
    }
  }

  private stopVideoPreview(): void {
    if (!this.videoPreviewId) return;
    const id = this.videoPreviewId;
    const src = this.videoPreviewSrc;
    this.videoPreviewId = null;
    this.videoPreviewSrc = null;
    const sprite = this.sprites.get(id);
    const card = this.cards.get(id);
    if (sprite && card) this.requestLod(card, sprite); // reapply the cached poster thumbnail
    if (src) void Assets.unload(src).catch(() => {});
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
    if (this.textResolutionTimer !== null) window.clearTimeout(this.textResolutionTimer);
    if (this.texRetryTimer !== null) window.clearTimeout(this.texRetryTimer);
    this.stopVideoPreview();
    this.clearScene();
    this.clearMarquee();
    this.selectionOutline?.destroy();
    for (const h of this.handles) h.destroy();
    for (const g of this.connectionLineGraphics) g.destroy();
    for (const g of this.hubDisplayObjects) g.destroy();
    this.connectHandleGraphic?.destroy();
    this.connectDragLine?.destroy();
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
