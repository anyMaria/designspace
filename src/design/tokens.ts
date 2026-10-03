/**
 * Numeric/hex mirror of tokens.css for PixiJS, which renders on a canvas and can't read CSS
 * custom properties. Keep this in sync with tokens.css by hand — see docs/IMPLEMENTATION_PLAN.md §3.2.
 */

export const colors = {
  canvas: 0x1e1024,
  canvasEdge: 0x170b1c,
  dot: 0xecdef5,
  dotAlpha: 0.16,
  surface1: 0x2a1832,
  surface2: 0x33203d,
  surface3: 0x3d2847,
  hairline: 0xffffff,
  hairlineAlpha: 0.08,

  text1: 0xf4eef6,
  text2: 0xc9bcd0,
  text3: 0x9a8ba3,

  accent: 0xe9a845,
  onAccent: 0x2a1832,
  sage: 0x93b89d,
  blush: 0xf0b7b3,
  cream: 0xefe6d6,
  lavender: 0xb7a6e8,
  sky: 0x8cc6e6,
  danger: 0xee8a7c,
} as const;

export const criterionColors = {
  tags: colors.sage,
  vibe: colors.blush,
  type: colors.accent,
  movement: colors.cream,
  color: colors.lavender,
  similar: colors.sky,
  manual: 0xffffff,
} as const;

export const criterionLineStyle = {
  tags: 'solid',
  vibe: 'solid',
  type: 'solid',
  movement: 'solid',
  color: 'dotted',
  similar: 'dashed',
  manual: 'solid',
} as const;

export const colorFamilies = {
  red: 0xe05a5a,
  orange: 0xee8e3a,
  yellow: 0xefd05a,
  green: 0x6dbe6a,
  teal: 0x4fb7a8,
  blue: 0x5a8fe0,
  purple: 0x9a6be0,
  pink: 0xe07ab8,
  brown: 0x9a6b4b,
  black: 0x1a1a1a,
  grey: 0x8c8c8c,
  white: 0xf2f2f2,
} as const;

export type ColorFamily = keyof typeof colorFamilies;

/** §2.11 note colors — reuses the existing "stone" accents (already light/pastel enough to read
 * dark text on, and already present in both palettes) rather than inventing a new set. `text` is
 * the same dark ink for all of them; every stone here is light enough for it to read clearly. */
export const noteColors = {
  cream: colors.cream,
  blush: colors.blush,
  sage: colors.sage,
  sky: colors.sky,
  lavender: colors.lavender,
} as const;
export type NoteColor = keyof typeof noteColors;
export const noteColorNames = Object.keys(noteColors) as NoteColor[];
export const noteTextColor = colors.canvas;

/** World-unit sizes and geometry — see §3.4, §4.6. */
export const canvasGeometry = {
  /** Card corner radius in world units. Never drawn below 2px on screen. */
  cardRadiusWorld: 10,
  cardMinScreenRadiusPx: 2,
  /** Below this on-screen long side, items draw as a flat rect (no texture, no radius/shadow). */
  farZoomThresholdPx: 24,
  /** Thumbnail breakpoints, screen-space long side in px. */
  lod: {
    t128Max: 160,
    t512Max: 600,
  },
  dotGridWorldSpacing: 24,
  dotScreenPx: 1.6,
  dotDenseThresholdPx: 12,
  dotSparseThresholdPx: 96,
  selectionOutlinePx: 2,
  hubBaseRadiusPx: 10,
  dimSearch: 0.12,
  dimConnections: 0.35,
  lineWidthPx: 1.5,
  lineWidthHoverPx: 2.5,
  lineOpacityHover: 0.7,
  lineOpacityShowAll: 0.35,
} as const;

/** Motion durations in ms — mirrors the CSS custom properties in tokens.css. */
export const motion = {
  hover: 120,
  /** How long the pointer rests on a card before its name pill appears (B3). */
  hoverName: 350,
  panel: 200,
  overlay: 320,
  flyTo: 500,
  constellations: 800,
} as const;

/** Zoom range, world %  — §2.2. */
export const zoomRange = {
  min: 0.02,
  max: 8,
  /** Multiplier per Ctrl+=/Ctrl+− press or zoom-menu click. */
  step: 1.3,
} as const;
