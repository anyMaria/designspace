// Our strict CSP has no 'unsafe-eval' (§4.12), so PixiJS can't use its default new-Function()
// shader/uniform sync. This polyfill installs the static fallback and must load before any
// renderer initializes — see node_modules/pixi.js/skills/pixijs-environments/SKILL.md.
import 'pixi.js/unsafe-eval';
import { cardAlpha, connectionRelatedSet } from './cardAlpha';
import { drawPalette, paletteDrawKey } from './decor/paletteDecor';
import { drawFontCollection, fontCollectionDrawKey } from './decor/fontCollectionDecor';
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
import { readableTextColor } from '@/lib/color';
import { SpatialIndex } from './spatialIndex';
import { TextureManager } from './TextureManager';
import { attachCanvasInput, type Tool, type WheelMode } from './input';
import { hitTest, normalizeRect, rectSelect } from './selection';
import { cardUvToImageUv, coverFrame, dragCropFocus, isWholeTexture } from './coverCrop';
import {
  createFavoriteBadge,
  FAVORITE_BADGE_INSET,
  FAVORITE_BADGE_MIN_ZOOM,
} from './favoriteBadge';
import {
  ALL_HANDLES,
  cursorForHandle,
  isCornerHandle,
  resizeHandleAt,
  resizePolicyFor,
  resizeRect,
  type ResizeHandle,
} from './resizeMath';
import {
  canvasGeometry,
  colors,
  connectionLineStyle,
  CONNECT_HANDLE_OFFSET_PX,
  resizeHandles,
  criterionColors,
  fonts,
  noteGeometry,
  noteStyles,
  snap,
  type NoteColor,
} from '@/design/tokens';
import type { BenchRect } from '@/platform/seed/bench';
import { rectsIntersect, unionRects, type Rect } from '@/lib/geometry';
import { CRITERION_ORDER, type Criterion, type Hub, type ScoredCandidate } from '@/lib/connections';
import type { ItemKind } from '@/state/types';
import { SnapGuideLayer, type SnapOverlay } from './snapGuides';
import { SnapSession, collectSnapTargets } from './snapSession';
import { exportRectForCards, type ExportBackground, type ExportScale } from '@/lib/exportGeometry';
import { formatDuration } from '@/lib/formatDuration';

export interface EngineOptions {
  getTool: () => Tool;
  getWheelMode: () => WheelMode;
  /** Snap while moving and resizing (Patch 3 · C2); Ctrl frees a single drag. */
  getSnapping?: () => boolean;
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
  /** Patch 2 · C6: drawn with a star badge in its top-left corner. */
  favorite: boolean;
  /** Patch 2 · C3: the crop focus (0–1) of a picture the owner has cropped; null = not cropped. */
  cropX: number | null;
  cropY: number | null;
  /** Patch 2 · F5: the type collection this family is a row of; null otherwise. */
  parentId?: string | null;
  /** Patch 2 · F5: set on a type collection card (drawn by `decor/fontCollectionDecor.ts`). */
  collection?: { title: string; count: number } | null;
}

interface EngineEvents {
  select: (ids: string[]) => void;
  move: (updates: { id: string; x: number; y: number }[]) => void;
  resize: (update: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    cropX?: number | null;
    cropY?: number | null;
  }) => void;
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
  /** "Adjust crop" finished with a different focus (Patch 2 · C3). */
  cropCommit: (update: { id: string; cropX: number; cropY: number }) => void;
  /** "Adjust crop" ended, by any route. */
  cropEnd: () => void;
  /** A card drag or resize started (true) or ended (false): floating tools hide meanwhile. */
  dragState: (dragging: boolean) => void;
}

const LINE_WIDTH_PX = connectionLineStyle.width;
const LINE_WIDTH_HOVERED_PX = connectionLineStyle.width + 1;
const LINE_OPACITY = connectionLineStyle.opacity;
const TEXTURE_RETRY_MS = 5000; // a texture that failed to load is retried once after this
const MAX_TEXTURE_ATTEMPTS = 2;
const RESIZE_MIN_SIZE = 40; // smallest card a resize can make, in world units
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
  /** Patch 2 · C6: the star badge of a favourite card, same lifecycle as `cornerBadges`. */
  private favBadges = new Map<string, Container>();
  /** Cards that draw themselves (swatches/palettes now, notes in D1): their sprite is never shown,
   * this container is. Keyed by item id. */
  private decor = new Map<string, Container>();
  private decorKey = new Map<string, string>();
  /** A note's text is clipped to its paper by this mask (a child of its decor container). */
  private noteMasks = new Map<string, Graphics>();

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
  // Pictures are drawn "cover" (never stretched; Patch 2 · C3): `baseTex` is the shared texture a
  // card currently shows, `cropTex` the cheap sub-frame of it when the card's proportions differ.
  private baseTex = new Map<string, Texture>();
  private cropTex = new Map<string, Texture>();
  // "Adjust crop" mode (Patch 2 · C3): the card being adjusted, its focus when the mode started,
  // and the dimmed whole-picture overlay.
  private cropId: string | null = null;
  private cropStart: { x: number; y: number } | null = null;
  private cropOverlay: (Graphics | Sprite)[] = [];
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
  private snapLayer: SnapGuideLayer | null = null;
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
    cropCommit: new Set(),
    cropEnd: new Set(),
    dragState: new Set(),
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
    this.snapLayer = new SnapGuideLayer();
    this.overlayLayer.addChild(this.snapLayer.container);

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
            if (card) {
              sprite.tint = card.dominantColor;
              sprite.width = card.w;
              sprite.height = card.h;
            }
          }
          this.dropCropTexture(id);
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
        this.dropCropTexture(id);
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
        this.favBadges.get(id)?.destroy({ children: true });
        this.favBadges.delete(id);
      }
    }
    for (const card of cards) {
      const existing = this.sprites.get(card.id);
      if (existing) {
        const prev = this.cards.get(card.id);
        existing.position.set(card.x, card.y);
        existing.width = card.w;
        existing.height = card.h;
        existing.zIndex = card.z;
        if (
          !prev ||
          prev.w !== card.w ||
          prev.h !== card.h ||
          prev.cropX !== card.cropX ||
          prev.cropY !== card.cropY
        ) {
          // `refreshCrop` reads the new card, which isn't in `this.cards` yet.
          this.refreshCrop(card.id, card);
        }
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
    this.scheduleFrame();
  }

  /** Whether this card draws itself through a decor container instead of its sprite. */
  private isSelfDrawn(card: ItemCard): boolean {
    return card.kind === 'swatch' || card.kind === 'note' || !!card.collection;
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
    if (card.collection) {
      const key = fontCollectionDrawKey(card);
      if (this.decorKey.get(card.id) !== key) {
        drawFontCollection(decor, { w: card.w, h: card.h, ...card.collection });
        this.decorKey.set(card.id, key);
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
    this.syncFavoriteBadge(card);
  }

  private favoriteBadgeShown(id: string): boolean {
    return !!this.cards.get(id)?.favorite && this.camera.zoom >= FAVORITE_BADGE_MIN_ZOOM;
  }

  /** The star badge of a favourite (Patch 2 · C6): created and removed with the favourite flag,
   * moved with the card. Hidden by `cullItems` below 25 % zoom and while the card is. */
  private syncFavoriteBadge(card: ItemCard): void {
    if (!this.itemsLayer) return;
    const existing = this.favBadges.get(card.id);
    if (!card.favorite) {
      if (existing) {
        existing.destroy({ children: true });
        this.favBadges.delete(card.id);
      }
      return;
    }
    const badge = existing ?? createFavoriteBadge();
    if (!existing) {
      this.itemsLayer.addChild(badge);
      this.favBadges.set(card.id, badge);
    }
    badge.position.set(card.x + FAVORITE_BADGE_INSET, card.y + FAVORITE_BADGE_INSET);
    badge.zIndex = card.z + 0.6;
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

  /** A connect pick or a point pick is waiting for a click (Esc cancels it). */
  isPicking(): boolean {
    return this.pickingConnectFrom !== null || this.pickingPoint !== null;
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
    const fav = this.favBadges.get(id);
    if (fav) fn(fav);
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

  /** Dragging a type collection or any of its rows moves the collection and all its rows. */
  private withCollectionGroup(ids: string[]): string[] {
    const out = new Set(ids);
    for (const id of ids) {
      const card = this.cards.get(id);
      const root = card?.parentId ?? (card?.collection ? id : null);
      if (!root) continue;
      out.add(root);
      for (const c of this.cards.values()) if (c.parentId === root) out.add(c.id);
    }
    return [...out];
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
    for (const id of [...this.cropTex.keys()]) this.dropCropTexture(id);
    this.baseTex.clear();
    this.texFailures.clear();
    for (const d of this.decor.values()) d.destroy({ children: true });
    this.decor.clear();
    this.decorKey.clear();
    for (const label of this.noteLabels.values()) label.destroy();
    this.noteLabels.clear();
    for (const badge of this.cornerBadges.values()) badge.destroy();
    this.cornerBadges.clear();
    for (const fav of this.favBadges.values()) fav.destroy({ children: true });
    this.favBadges.clear();
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

  /** The world point under the last pointer position, or null when the pointer is outside the
   * canvas (Patch 3 · P3: a paste lands under the pointer when it is over the map). */
  pointerWorld(): { x: number; y: number } | null {
    if (!this.app || !this.lastPointer) return null;
    const { width: vw, height: vh } = this.app.screen;
    return this.camera.screenToWorld(this.lastPointer.x, this.lastPointer.y, vw, vh);
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
    const edge = this.camera.worldToScreen(card.x + card.w, card.y + card.h / 2, vw, vh);
    return { x: edge.x + CONNECT_HANDLE_OFFSET_PX, y: edge.y };
  }

  /** Whether the pointer is on the strip between the hovered card's right edge and its connect
   * handle, or on the handle itself. */
  private overConnectHandleZone(): boolean {
    if (!this.hoveredId || !this.lastPointer) return false;
    const handle = this.connectHandleScreenPos(this.hoveredId);
    const rect = this.getScreenRect(this.hoveredId);
    if (!handle || !rect) return false;
    const p = this.lastPointer;
    return (
      p.x >= rect.x + rect.w &&
      p.x <= handle.x + CONNECT_HANDLE_HIT_PX &&
      Math.abs(p.y - handle.y) <= CONNECT_HANDLE_HIT_PX
    );
  }

  /** The resize handle of `card` under a world point (a whole edge counts, not only the pill). */
  private resizeHandleUnder(card: ItemCard, world: { x: number; y: number }): ResizeHandle | null {
    // A type collection and its rows are laid out by their commands, never resized by hand.
    if (card.collection || card.parentId) return null;
    return resizeHandleAt(card, world, {
      tolerance: resizeHandles.hitTolerance / this.camera.zoom,
      handles: resizePolicyFor(card.kind).handles,
    });
  }

  private attachSelectionInput(container: HTMLElement, opts: EngineOptions): () => void {
    let mode: 'idle' | 'marquee' | 'move' | 'resize' | 'connect' | 'crop' = 'idle';
    let cropDragWorld = { x: 0, y: 0 };
    let cropFocusStart = { x: 0.5, y: 0.5 };
    let startWorld = { x: 0, y: 0 };
    let startScreen = { x: 0, y: 0 };
    let moved = false;
    // The card pressed on, and whether it was already selected before this press: a plain click
    // on a colour cell of an already-selected palette copies that colour (C3).
    let pressed: { id: string; wasSelected: boolean } | null = null;
    let resizeHandle: ResizeHandle | null = null;
    let resizeTargetId: string | null = null;
    let resizeStartRect = { x: 0, y: 0, w: 0, h: 0 };
    let handleCursor = false;
    let moveOrigin = new Map<string, { x: number; y: number }>();
    let snapSession: SnapSession | null = null;
    let moveBounds = { x: 0, y: 0, w: 0, h: 0 };
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

      // "Adjust crop": a press inside the card drags the picture; anywhere else finishes.
      if (this.cropId) {
        const cropCard = this.cards.get(this.cropId);
        const inside =
          !!cropCard &&
          world.x >= cropCard.x &&
          world.x <= cropCard.x + cropCard.w &&
          world.y >= cropCard.y &&
          world.y <= cropCard.y + cropCard.h;
        if (cropCard && inside) {
          mode = 'crop';
          cropDragWorld = world;
          cropFocusStart = { x: cropCard.cropX ?? 0.5, y: cropCard.cropY ?? 0.5 };
          container.setPointerCapture(e.pointerId);
        } else {
          this.endCropMode();
        }
        return;
      }

      // Picking a colour from a photo overrides normal click behaviour too.
      if (this.pickingPoint) {
        const cb = this.pickingPoint;
        this.cancelPointPick();
        const hit = hitTest(this.interactableCards(), world);
        const isPicture = hit && ['image', 'video', 'pdf', 'link'].includes(hit.kind);
        if (hit && isPicture) {
          // On a cropped card the click is inside the visible part: map it to the whole picture.
          const base = this.baseTex.get(hit.id);
          const uv = base
            ? cardUvToImageUv(
                (world.x - hit.x) / hit.w,
                (world.y - hit.y) / hit.h,
                hit,
                base.width / base.height,
                { x: hit.cropX, y: hit.cropY },
              )
            : { u: (world.x - hit.x) / hit.w, v: (world.y - hit.y) / hit.h };
          cb({ id: hit.id, u: uv.u, v: uv.v });
        } else {
          cb(null);
        }
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

      // Resize handle on the current single-selection?
      if (this.selection.size === 1) {
        const id = [...this.selection][0];
        const card = this.cards.get(id);
        if (card) {
          const handle = this.resizeHandleUnder(card, world);
          if (handle) {
            mode = 'resize';
            resizeHandle = handle;
            resizeTargetId = id;
            resizeStartRect = { x: card.x, y: card.y, w: card.w, h: card.h };
            e.preventDefault(); // Alt-drag must not trigger the browser's Alt behaviour
            container.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const hit = hitTest(this.interactableCards(), world);
      pressed = hit ? { id: hit.id, wasSelected: this.selection.has(hit.id) } : null;
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
          this.withCollectionGroup([...this.selection]).map((id) => {
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
        // A resize cursor while the pointer is over a handle of the selected card.
        const only = this.selection.size === 1 ? this.cards.get([...this.selection][0]) : undefined;
        const overHandle = only ? this.resizeHandleUnder(only, world) : null;
        if (overHandle) {
          container.style.cursor = cursorForHandle(overHandle);
          handleCursor = true;
        } else if (handleCursor) {
          container.style.cursor = '';
          handleCursor = false;
        }
        const hit = hitTest(this.interactableCards(), world);
        // The connect handle sits outside the card: keep the card hovered while the pointer travels
        // the gap to it and over it, or the handle would vanish before it can be grabbed.
        if (hit?.id !== this.hoveredId && !this.overConnectHandleZone()) {
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
          this.emit('dragState', true);
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
        let worldDx = world.x - startWorld.x;
        let worldDy = world.y - startWorld.y;
        if (justStartedMoving && opts.getSnapping?.() !== false) {
          const begun = this.beginSnap(moveOrigin.keys(), moveOrigin);
          snapSession = begun?.session ?? null;
          moveBounds = begun?.bounds ?? moveBounds;
        }
        if (snapSession) {
          if (e.ctrlKey || e.metaKey) {
            this.showSnap(null);
          } else {
            const snapped = snapSession.move(moveBounds, { x: worldDx, y: worldDy });
            worldDx = snapped.dx;
            worldDy = snapped.dy;
            this.showSnap(snapped.overlay);
          }
        }
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
      } else if (mode === 'crop' && this.cropId) {
        const card = this.cards.get(this.cropId);
        const base = this.baseTex.get(this.cropId);
        if (card && base) {
          const focus = dragCropFocus(
            cropFocusStart,
            { x: world.x - cropDragWorld.x, y: world.y - cropDragWorld.y },
            card,
            base.width / base.height,
          );
          card.cropX = focus.x;
          card.cropY = focus.y;
          this.refreshCrop(card.id, card);
          this.scheduleFrame();
        }
      } else if (mode === 'resize' && resizeTargetId && resizeHandle) {
        const card = this.cards.get(resizeTargetId);
        const sprite = this.sprites.get(resizeTargetId);
        if (card && sprite) {
          if (e.altKey) e.preventDefault();
          const policy = resizePolicyFor(card.kind);
          const keepAspect =
            isCornerHandle(resizeHandle) && (policy.alwaysKeepAspect || !e.shiftKey);
          let next = resizeRect(
            resizeStartRect,
            resizeHandle,
            { x: world.x - startWorld.x, y: world.y - startWorld.y },
            { keepAspect, fromCenter: e.altKey, minSize: RESIZE_MIN_SIZE },
          );
          if (justStartedMoving && opts.getSnapping?.() !== false) {
            snapSession = this.beginSnap([resizeTargetId], new Map())?.session ?? null;
          }
          if (snapSession) {
            if (e.ctrlKey || e.metaKey) {
              this.showSnap(null);
            } else {
              const snapped = snapSession.resize(resizeStartRect, next, resizeHandle, {
                keepAspect,
                fromCenter: e.altKey,
              });
              const big = snapped.rect.w >= RESIZE_MIN_SIZE && snapped.rect.h >= RESIZE_MIN_SIZE;
              if (big) next = snapped.rect;
              this.showSnap(big ? snapped.overlay : null);
            }
          }
          card.x = next.x;
          card.y = next.y;
          card.w = next.w;
          card.h = next.h;
          sprite.position.set(next.x, next.y);
          sprite.width = next.w;
          sprite.height = next.h;
          this.refreshCrop(card.id, card);
          this.syncNoteLabel(card);
          this.drawSelectionOverlay();
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (this.dragging) {
        this.dragging = false;
        this.emit('dragState', false);
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
        const updates = [...moveOrigin.keys()].map((id) => {
          const c = this.cards.get(id);
          return { id, x: c?.x ?? 0, y: c?.y ?? 0 };
        });
        this.emit('move', updates);
      } else if (mode === 'resize' && moved && resizeTargetId) {
        const c = this.cards.get(resizeTargetId);
        if (c) {
          // Changing a picture's proportions crops it (centred, unless it already has a focus).
          const startAspect = resizeStartRect.w / resizeStartRect.h;
          const changed = Math.abs(c.w / c.h / startAspect - 1) > 0.01;
          const marksCrop = resizePolicyFor(c.kind).crops && changed && c.cropX === null;
          this.emit('resize', {
            id: resizeTargetId,
            x: c.x,
            y: c.y,
            w: c.w,
            h: c.h,
            ...(marksCrop ? { cropX: 0.5, cropY: 0.5 } : {}),
          });
        }
      } else if (mode === 'connect' && connectFromId) {
        const world = toWorld(e);
        const hit = hitTest(this.interactableCards(), world);
        this.clearConnectDragLine();
        if (hit && hit.id !== connectFromId) this.emit('connectDrop', connectFromId, hit.id);
      }
      mode = 'idle';
      snapSession = null;
      this.showSnap(null);
      resizeHandle = null;
      resizeTargetId = null;
      connectFromId = null;
      if (handleCursor) {
        container.style.cursor = '';
        handleCursor = false;
      }
      this.connecting = false;
      this.drawConnectHandle();
      moveOrigin.clear();
      container.releasePointerCapture(e.pointerId);
    };

    const onDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
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

  /** Collects what a drag can snap to (the visible cards that are not being moved) and returns
   * the session, plus the bounds of the moved cards. Null when there is nothing to snap to. */
  private beginSnap(
    movingIds: Iterable<string>,
    origins: Map<string, { x: number; y: number }>,
  ): { session: SnapSession; bounds: { x: number; y: number; w: number; h: number } } | null {
    if (!this.app) return null;
    const moving = new Set(movingIds);
    const rects = [...moving].flatMap((id) => {
      const c = this.cards.get(id);
      if (!c) return [];
      const o = origins.get(id);
      return [{ x: o?.x ?? c.x, y: o?.y ?? c.y, w: c.w, h: c.h }];
    });
    const bounds = unionRects(rects);
    if (!bounds) return null;
    const { width: vw, height: vh } = this.app.screen;
    const view = this.camera.viewportWorldRect(vw, vh, 0);
    const targets = collectSnapTargets(this.cards.values(), moving, view, bounds);
    if (targets.length === 0) return null;
    return { session: new SnapSession(targets, snap.thresholdPx / this.camera.zoom), bounds };
  }

  /** Draws (or, with null, clears) the snapping guides. */
  private showSnap(overlay: SnapOverlay | null): void {
    if (!this.snapLayer || !this.app) return;
    if (!overlay) {
      this.snapLayer.clear();
      return;
    }
    const { width: vw, height: vh } = this.app.screen;
    this.snapLayer.show(overlay, (wx, wy) => this.camera.worldToScreen(wx, wy, vw, vh));
    this.scheduleFrame();
  }

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
    // Tests read the single selected card's on-screen rect from this attribute (container px).
    this.container?.removeAttribute('data-selected-rect');

    const selected = [...this.selection]
      .map((id) => this.cards.get(id))
      .filter((c): c is ItemCard => !!c);
    if (selected.length === 0) return;
    if (selected.length === 1) {
      const c = selected[0];
      const tl = this.camera.worldToScreen(c.x, c.y, this.app.screen.width, this.app.screen.height);
      this.container?.setAttribute(
        'data-selected-rect',
        JSON.stringify({ x: tl.x, y: tl.y, w: c.w * this.camera.zoom, h: c.h * this.camera.zoom }),
      );
    }

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
      const handles = card.collection || card.parentId ? [] : resizePolicyFor(card.kind).handles;
      const { corner, sideLong, sideShort } = resizeHandles;
      const w = card.w * this.camera.zoom;
      const h = card.h * this.camera.zoom;
      const origin = this.camera.worldToScreen(
        card.x,
        card.y,
        this.app.screen.width,
        this.app.screen.height,
      );
      for (const name of ALL_HANDLES) {
        if (!handles.includes(name)) continue;
        const cx = origin.x + (name.includes('w') ? 0 : name.includes('e') ? w : w / 2);
        const cy = origin.y + (name.startsWith('n') ? 0 : name.startsWith('s') ? h : h / 2);
        const isCorner = isCornerHandle(name);
        // Sides are small pills lying along their edge; corners are squares with an accent border.
        const horizontalEdge = name === 'n' || name === 's';
        const hw = isCorner ? corner : horizontalEdge ? sideLong : sideShort;
        const hh = isCorner ? corner : horizontalEdge ? sideShort : sideLong;
        const g = new Graphics();
        if (isCorner) {
          g.rect(cx - hw / 2, cy - hh / 2, hw, hh)
            .fill(0xffffff)
            .stroke({ color: colors.accent, width: 1.5 });
        } else {
          g.roundRect(cx - hw / 2, cy - hh / 2, hw, hh, Math.min(hw, hh) / 2).fill(0xffffff);
        }
        this.overlayLayer.addChild(g);
        this.handles.push(g);
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
      this.drawCropOverlay();
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
        const fav = this.favBadges.get(id);
        if (fav) fav.visible = false;
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
      const fav = this.favBadges.get(id);
      if (fav) fav.visible = !hidden && this.favoriteBadgeShown(id);
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

  /** The world-space rect a PNG/PDF export renders: the padded bounding box of the cards with
   * these ids, or of every card in the current space when `ids` is null. `null` when there's
   * nothing to export. */
  getExportRect(ids: string[] | null): Rect | null {
    const cards = ids
      ? ids.map((id) => this.cards.get(id)).filter((c): c is ItemCard => !!c)
      : [...this.cards.values()];
    return exportRectForCards(cards);
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
      const fav = this.favBadges.get(id);
      if (fav) fav.visible = true;
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
            this.applyTexture(id, sprite, texture);
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

  /** Shows `base` on the card's sprite, cover-fitted: the whole texture when the card has the
   * picture's proportions, otherwise a sub-frame of it (shares the GPU source) positioned by the
   * crop focus. */
  private applyTexture(id: string, sprite: Sprite, base: Texture, card = this.cards.get(id)): void {
    this.baseTex.set(id, base);
    const old = this.cropTex.get(id);
    let next = base;
    if (card && card.w > 0 && card.h > 0 && base !== Texture.WHITE) {
      const f = coverFrame(base.width, base.height, card.w, card.h, card.cropX, card.cropY);
      if (!isWholeTexture(f, base.width, base.height)) {
        next = new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
      }
    }
    if (next === base) this.cropTex.delete(id);
    else this.cropTex.set(id, next);
    sprite.texture = next;
    if (card) {
      sprite.width = card.w;
      sprite.height = card.h;
    }
    if (old && old !== next) old.destroy(false); // never the shared source
  }

  /** Enters "Adjust crop" for a picture card: its whole picture shows dimmed around the card, and
   * dragging inside moves it. False when the card isn't a cropped-able picture or isn't loaded. */
  startCropMode(id: string): boolean {
    const card = this.cards.get(id);
    if (!card || !this.baseTex.has(id) || !resizePolicyFor(card.kind).crops) return false;
    this.cropId = id;
    this.cropStart = { x: card.cropX ?? 0.5, y: card.cropY ?? 0.5 };
    if (this.container) this.container.style.cursor = 'move';
    this.scheduleFrame();
    return true;
  }

  isCropping(): boolean {
    return this.cropId !== null;
  }

  /** Leaves "Adjust crop" (Enter, Esc, or a click outside); emits `cropCommit` when the focus moved. */
  endCropMode(): void {
    const id = this.cropId;
    if (!id) return;
    const card = this.cards.get(id);
    const start = this.cropStart;
    this.cropId = null;
    this.cropStart = null;
    if (this.container) this.container.style.cursor = '';
    this.scheduleFrame();
    this.emit('cropEnd');
    if (!card || !start) return;
    const x = card.cropX ?? 0.5;
    const y = card.cropY ?? 0.5;
    if (Math.abs(x - start.x) > 1e-4 || Math.abs(y - start.y) > 1e-4) {
      this.emit('cropCommit', { id, cropX: x, cropY: y });
    }
  }

  /** The dimmed whole picture around the card, and the card's part outlined in white. */
  private drawCropOverlay(): void {
    for (const g of this.cropOverlay) g.destroy();
    this.cropOverlay = [];
    if (!this.cropId || !this.overlayLayer || !this.app) return;
    const card = this.cards.get(this.cropId);
    const base = this.baseTex.get(this.cropId);
    if (!card || !base) return;
    const { width: vw, height: vh } = this.app.screen;
    const zoom = this.camera.zoom;
    const f = coverFrame(base.width, base.height, card.w, card.h, card.cropX, card.cropY);
    const scale = card.w / f.w; // card (world) units per texture pixel
    const topLeft = this.camera.worldToScreen(card.x - f.x * scale, card.y - f.y * scale, vw, vh);
    const full = new Sprite(base);
    full.alpha = 0.32;
    full.position.set(topLeft.x, topLeft.y);
    full.width = base.width * scale * zoom;
    full.height = base.height * scale * zoom;
    const cardTopLeft = this.camera.worldToScreen(card.x, card.y, vw, vh);
    const outline = new Graphics()
      .rect(cardTopLeft.x, cardTopLeft.y, card.w * zoom, card.h * zoom)
      .stroke({ color: 0xffffff, width: 2 });
    this.overlayLayer.addChild(full);
    this.overlayLayer.addChild(outline);
    this.cropOverlay.push(full, outline);
  }

  /** Re-fits the picture after the card's size or crop focus changed. */
  private refreshCrop(id: string, card: ItemCard): void {
    const base = this.baseTex.get(id);
    const sprite = this.sprites.get(id);
    if (base && sprite && !sprite.destroyed) this.applyTexture(id, sprite, base, card);
  }

  private dropCropTexture(id: string): void {
    this.baseTex.delete(id);
    const crop = this.cropTex.get(id);
    this.cropTex.delete(id);
    crop?.destroy(false);
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
      this.applyTexture(card.id, sprite, texture);
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
        this.applyTexture(id, sprite, texture);
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
    for (const g of this.cropOverlay) g.destroy();
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
