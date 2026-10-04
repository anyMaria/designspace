/**
 * Colour studio maths (pure, no DOM): harmony rules, the palette generator, WCAG contrast,
 * colour-vision-deficiency previews and mood-based eyedropper placement.
 * Reference implementation for the Colour studio plan; split into `src/lib/colorHarmony.ts`,
 * `colorGenerate.ts`, `colorContrast.ts`, `colorMood.ts` if one file feels too long.
 */
import {
  clampChroma,
  differenceEuclidean,
  converter,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  formatHex,
  wcagContrast,
  wcagLuminance,
} from 'culori';

const toOklch = converter('oklch');
const toOklab = converter('oklab');
const toLrgb = converter('lrgb');

const upper = (hex: string): string => hex.toUpperCase();
const wrap = (deg: number): number => ((deg % 360) + 360) % 360;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** An OKLCH colour mapped into sRGB by lowering its chroma (hue and lightness kept), as `#RRGGBB`. */
function oklchHex(l: number, c: number, h: number): string {
  return upper(
    formatHex(clampChroma({ mode: 'oklch', l: clamp01(l), c: Math.max(0, c), h }, 'oklch')),
  );
}

// ---------------------------------------------------------------------------------------------
// 1. Harmony rules (the Wheel tab)
// ---------------------------------------------------------------------------------------------

/** h in degrees 0–360, s and v in 0–1 (same convention as `hexToHsv` in lib/palette.ts). */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export type HarmonyRule =
  | 'analogous'
  | 'monochromatic'
  | 'triad'
  | 'complementary'
  | 'splitComplementary'
  | 'square'
  | 'compound'
  | 'shades'
  | 'custom';

export type WheelKind = 'ryb' | 'rgb';

/** Artist's (RYB) wheel angle ↔ HSV hue anchors. Red 0, orange 60, yellow 120, green 180, blue
 * 240, violet 300 on the RYB wheel, so complements are the ones painters expect (red↔green,
 * yellow↔violet, blue↔orange). Piecewise linear in between. */
const RYB_ANCHORS: readonly [ryb: number, hue: number][] = [
  [0, 0],
  [60, 30],
  [120, 60],
  [180, 120],
  [240, 240],
  [300, 280],
  [360, 360],
];

function piecewise(x: number, from: 0 | 1, to: 0 | 1): number {
  const v = wrap(x);
  for (let i = 1; i < RYB_ANCHORS.length; i++) {
    const a = RYB_ANCHORS[i - 1];
    const b = RYB_ANCHORS[i];
    if (v <= b[from]) {
      const t = (v - a[from]) / (b[from] - a[from]);
      return wrap(a[to] + t * (b[to] - a[to]));
    }
  }
  return 0;
}

/** RYB wheel angle → HSV hue. */
export function rybToHue(angle: number): number {
  return piecewise(angle, 0, 1);
}

/** HSV hue → RYB wheel angle. */
export function hueToRyb(hue: number): number {
  return piecewise(hue, 1, 0);
}

/** Hue offsets (wheel degrees) of each rule's own colours, base first. */
const HUE_OFFSETS: Record<Exclude<HarmonyRule, 'monochromatic' | 'shades' | 'custom'>, number[]> = {
  analogous: [0, 30, -30, 60, -60],
  triad: [0, 120, 240],
  complementary: [0, 180],
  splitComplementary: [0, 150, 210],
  square: [0, 90, 180, 270],
  // Adobe doesn't publish its angles; this is "base + a neighbour + the complement + the
  // complement's neighbour", which is what its Compound rule looks like.
  compound: [0, 30, 180, 150],
};

/** k in [-1, 1]: negative is a darker, richer tone; positive a lighter, softer tint. */
function tone(c: Hsv, k: number): Hsv {
  if (k >= 0) return { h: c.h, s: clamp01(c.s * (1 - 0.6 * k)), v: clamp01(c.v + (1 - c.v) * k) };
  return { h: c.h, s: clamp01(c.s + (1 - c.s) * -k * 0.3), v: clamp01(c.v * (1 + k * 0.75)) };
}

/** Tone steps for the extra slots when a rule has fewer hues than the palette has colours. */
const EXTRA_TONES = [0.45, -0.45, 0.8, -0.75, 0.25, -0.25, 0.6, -0.6];

/** `n` evenly spaced points over [lo, hi]; the one nearest `keep` is dropped (that's the base). */
function gridWithout(n: number, lo: number, hi: number, keep: number): number[] {
  if (n <= 1) return [];
  const grid = Array.from({ length: n }, (_, i) => lo + (i * (hi - lo)) / (n - 1));
  let nearest = 0;
  grid.forEach((g, i) => {
    if (Math.abs(g - keep) < Math.abs(grid[nearest] - keep)) nearest = i;
  });
  return grid.filter((_, i) => i !== nearest);
}

/**
 * The colours of a harmony rule built from `base`. Index 0 is always `base` itself, so dragging
 * the base knob re-runs this and every other colour follows. Offsets are measured on the artist's
 * RYB wheel by default (Adobe Color's behaviour); pass `'rgb'` for plain HSV hue maths.
 * `custom` only proposes evenly spaced hues as a starting point: in Custom mode the UI moves each
 * knob on its own and must not call this on every drag.
 */
export function harmony(
  base: Hsv,
  rule: HarmonyRule,
  count: number,
  wheel: WheelKind = 'ryb',
): Hsv[] {
  const n = Math.max(1, Math.floor(count));
  const b: Hsv = { h: wrap(base.h), s: clamp01(base.s), v: clamp01(base.v) };
  const rotate = (offset: number): number =>
    wheel === 'ryb' ? rybToHue(hueToRyb(b.h) + offset) : wrap(b.h + offset);

  if (rule === 'shades') {
    return [b, ...gridWithout(n, 0.15, 1, b.v).map((v) => ({ ...b, v }))];
  }
  if (rule === 'monochromatic') {
    return [b, ...gridWithout(n, -0.8, 0.8, 0).map((k) => tone(b, k))];
  }
  const offsets =
    rule === 'custom' ? Array.from({ length: n }, (_, i) => (360 * i) / n) : HUE_OFFSETS[rule];
  const out: Hsv[] = [];
  for (let i = 0; i < n; i++) {
    const group = i % offsets.length;
    const round = Math.floor(i / offsets.length);
    const hued: Hsv = { ...b, h: group === 0 ? b.h : rotate(offsets[group]) };
    out.push(round === 0 ? hued : tone(hued, EXTRA_TONES[(round - 1) % EXTRA_TONES.length]));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 2. Generate (Space / Surprise me)
// ---------------------------------------------------------------------------------------------

export interface Slot {
  hex: string;
  locked: boolean;
}

/** Seeded PRNG (mulberry32, same as lib/color.ts's private one) so a proposal is reproducible. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GENERATOR_RULES: readonly number[][] = [
  [0, 30, -30, 60], // analogous
  [0, 120, 240], // triad
  [0, 180], // complementary
  [0, 150, 210], // split complementary
  [0, 90, 180, 270], // square
  [0, 30, 180, 150], // compound
  [0], // monochromatic (lightness and chroma do the work)
];

interface Lab {
  l: number;
  a: number;
  b: number;
}

function labOf(hex: string): Lab {
  const c = toOklab(hex);
  return { l: c?.l ?? 0, a: c?.a ?? 0, b: c?.b ?? 0 };
}

function labDistance(p: Lab, q: Lab): number {
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

const MIN_DISTINCT = 0.09; // OKLab distance under which two proposals look like the same colour

/** Best of `tries` candidates: the one farthest (in OKLab) from every colour already chosen. */
function mostDistinct(make: () => string, taken: Lab[], tries: number): string {
  let best = make();
  let bestD = -1;
  for (let i = 0; i < tries; i++) {
    const hex = i === 0 ? best : make();
    const lab = labOf(hex);
    const d = taken.length === 0 ? 1 : Math.min(...taken.map((t) => labDistance(t, lab)));
    if (d > bestD) {
      best = hex;
      bestD = d;
    }
    if (d >= MIN_DISTINCT * 1.5) break;
  }
  return best;
}

/**
 * New colours for every unlocked slot; locked slots come back unchanged (uppercased).
 * `harmonious`: hues come from a harmony rule anchored on a locked colour (or a random hue when
 * nothing chromatic is locked); lightness and chroma vary in OKLCH and each proposal is the most
 * distinct of several candidates, so colours never repeat. `random`: anything, still distinct.
 * Deterministic for a given `rng` sequence.
 */
export function generatePalette(
  slots: Slot[],
  rng: () => number,
  mode: 'harmonious' | 'random',
): string[] {
  const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  const taken: Lab[] = slots.filter((s) => s.locked).map((s) => labOf(s.hex));

  if (mode === 'random') {
    return slots.map((s) => {
      if (s.locked) return upper(s.hex);
      const hex = mostDistinct(
        () => oklchHex(between(0.25, 0.95), between(0.02, 0.26), between(0, 360)),
        taken,
        4,
      );
      taken.push(labOf(hex));
      return hex;
    });
  }

  const locked = slots
    .filter((s) => s.locked)
    .map((s) => toOklch(s.hex))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const chromatic = locked.filter((c) => c.c >= 0.03 && c.h !== undefined);
  const anchor = chromatic.length > 0 ? chromatic[Math.floor(rng() * chromatic.length)] : null;
  const baseHue = anchor?.h ?? between(0, 360);
  const baseChroma = anchor ? anchor.c : between(0.07, 0.17);
  const rule = GENERATOR_RULES[Math.floor(rng() * GENERATOR_RULES.length)];
  const hues = [...rule.map((o) => wrap(baseHue + o)), ...chromatic.map((c) => c.h ?? baseHue)];

  let next = 0;
  return slots.map((s) => {
    if (s.locked) return upper(s.hex);
    const hue = hues[next++ % hues.length];
    const neutral = rng() < 0.2; // a tinted near-neutral now and then, like hand-made palettes
    const hex = mostDistinct(
      () => {
        const h = wrap(hue + between(-10, 10));
        if (neutral) {
          const dark = rng() < 0.5;
          return oklchHex(dark ? between(0.16, 0.28) : between(0.9, 0.97), between(0.01, 0.035), h);
        }
        return oklchHex(between(0.32, 0.9), Math.min(0.3, baseChroma * between(0.55, 1.25)), h);
      },
      taken,
      12,
    );
    taken.push(labOf(hex));
    return hex;
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Contrast (WCAG 2.x)
// ---------------------------------------------------------------------------------------------

export interface ContrastInfo {
  /** Unrounded. WCAG compares the exact value: 4.499 fails AA, so never round before comparing,
   * and show it rounded *down* (`Math.floor(r * 100) / 100`) so the label never says 4.50 for a fail. */
  ratio: number;
  aa: boolean; // normal text ≥ 4.5
  aaLarge: boolean; // large text (≥ 24 px, or ≥ 18.66 px bold) ≥ 3
  aaa: boolean; // normal text ≥ 7
  aaaLarge: boolean; // large text ≥ 4.5
}

export function contrastInfo(fg: string, bg: string): ContrastInfo {
  const ratio = wcagContrast(fg, bg);
  return { ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5 };
}

/**
 * The colour nearest to `fg` (same OKLCH hue and chroma, only lightness moves) whose contrast
 * with `bg` reaches `target`, checked on the final 8-bit hex. `fg` itself when it already passes;
 * `null` when no lightness gets there (e.g. 7:1 against a mid grey: even black and white fail).
 */
export function nearestPassing(fg: string, bg: string, target: number): string | null {
  if (wcagContrast(fg, bg) >= target) return upper(formatHex(fg) ?? fg);
  const c = toOklch(fg);
  if (!c) return null;
  const h = c.h ?? 0;
  const at = (l: number): string => oklchHex(l, c.c, h);
  const passes = (l: number): boolean => wcagContrast(at(l), bg) >= target;

  const candidates: { hex: string; dl: number }[] = [];
  for (const end of [1, 0]) {
    if (!passes(end)) continue; // the far end of this direction fails, so nothing in between passes
    let fail = c.l;
    let pass = end;
    for (let i = 0; i < 24; i++) {
      const mid = (fail + pass) / 2;
      if (passes(mid)) pass = mid;
      else fail = mid;
    }
    candidates.push({ hex: at(pass), dl: Math.abs(pass - c.l) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((p, q) => p.dl - q.dl);
  return candidates[0].hex;
}

// ---------------------------------------------------------------------------------------------
// 4. Colour-vision previews
// ---------------------------------------------------------------------------------------------

export type CvdType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

const SIMULATORS = {
  protanopia: filterDeficiencyProt(1),
  deuteranopia: filterDeficiencyDeuter(1),
  tritanopia: filterDeficiencyTrit(1),
} as const;

const toRgb = converter('rgb');

/**
 * How `hex` looks with a colour-vision deficiency (full severity), as `#RRGGBB`.
 * Machado et al. (2009) matrices — the ones culori ships — are meant for *linear* RGB, but culori
 * applies them to gamma-encoded sRGB. So: convert to linear, hand those numbers to culori labelled
 * as `rgb` (it then multiplies them as-is), and read the result back as linear. Achromatopsia is a
 * grey with the same WCAG luminance, so contrast between greys matches the original pair.
 */
export function simulateCvd(hex: string, type: CvdType): string {
  const lin = toLrgb(hex);
  if (!lin) return upper(hex);
  if (type === 'achromatopsia') {
    const y = wcagLuminance(hex);
    return upper(formatHex(toRgb({ mode: 'lrgb', r: y, g: y, b: y })));
  }
  const out = SIMULATORS[type]({ mode: 'rgb', r: lin.r, g: lin.g, b: lin.b });
  return upper(
    formatHex(toRgb({ mode: 'lrgb', r: clamp01(out.r), g: clamp01(out.g), b: clamp01(out.b) })),
  );
}

const oklabDistance = differenceEuclidean('oklab');

/** For each pair of neighbouring colours: are they hard to tell apart (OKLab distance under
 * `threshold`)? The result has one entry fewer than `hexes`. */
export function hardToTellApart(hexes: string[], threshold = 0.04): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i + 1 < hexes.length; i++) {
    out.push(oklabDistance(hexes[i], hexes[i + 1]) < threshold);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 5. Moods (From an image): colours AND where they are, for the eyedroppers
// ---------------------------------------------------------------------------------------------

export type Mood = 'colorful' | 'bright' | 'muted' | 'deep' | 'dark';

export interface PickedColor {
  hex: string;
  /** Pixel column/row in the image that was sampled (0-based). The eyedropper sits here. */
  x: number;
  y: number;
}

const MAX_SAMPLES = 2500; // ~50 × 50 grid: plenty for a 512-px thumbnail, fast on the main thread

/** Higher is a better fit. L in 0–1, C roughly 0–0.37 (sRGB tops out near 0.32). */
function moodScore(mood: Mood, l: number, c: number): number {
  const bell = (x: number, centre: number, width: number): number =>
    Math.max(0, 1 - Math.abs(x - centre) / width);
  const vivid = Math.min(1, c / 0.2);
  switch (mood) {
    case 'colorful':
      return vivid * 0.8 + bell(l, 0.68, 0.45) * 0.2;
    case 'bright':
      return bell(l, 0.85, 0.3) * 0.6 + vivid * 0.4;
    case 'muted':
      return bell(c, 0.05, 0.06) * 0.6 + bell(l, 0.62, 0.3) * 0.4;
    case 'deep':
      return vivid * 0.55 + bell(l, 0.42, 0.22) * 0.45;
    case 'dark':
      return bell(l, 0.2, 0.2) * 0.8 + vivid * 0.2;
  }
}

function hexAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): string {
  const i = (y * width + x) * 4;
  const part = (n: number) => n.toString(16).padStart(2, '0');
  return `#${part(pixels[i])}${part(pixels[i + 1])}${part(pixels[i + 2])}`.toUpperCase();
}

interface Sample {
  x: number;
  y: number;
  hex: string;
  lab: Lab;
  l: number;
  c: number;
  /** 0 on a flat area, towards 1 on edges/noise, so eyedroppers land on solid patches. */
  busy: number;
}

function gridSamples(pixels: Uint8ClampedArray, width: number, height: number): Sample[] {
  const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_SAMPLES)));
  const r = Math.max(1, Math.floor(step / 2));
  // Keep eyedroppers off the outer 3 % so their loupe isn't cut by the image edge.
  const m = Math.floor(Math.min(width, height) * 0.03);
  const out: Sample[] = [];
  for (let y = m + Math.floor(step / 2); y < height - m; y += step) {
    for (let x = m + Math.floor(step / 2); x < width - m; x += step) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue; // transparent
      const hex = hexAt(pixels, width, x, y);
      const lab = labOf(hex);
      let busy = 0;
      for (const [dx, dy] of [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ] as const) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        busy = Math.max(busy, labDistance(lab, labOf(hexAt(pixels, width, nx, ny))));
      }
      const lch = toOklch(hex);
      out.push({ x, y, hex, lab, l: lch?.l ?? 0, c: lch?.c ?? 0, busy: Math.min(1, busy / 0.15) });
    }
  }
  return out;
}

/**
 * `count` colours that fit `mood`, each with the pixel it came from. Greedy: each pick maximises
 * mood score × distinctness (OKLab distance to earlier picks) × flatness, and keeps eyedroppers at
 * least ~6 % of the image diagonal apart so they don't sit on top of each other. Deterministic.
 * `pixels` is RGBA (ImageData.data) of a `width × height` image (downscale to ≤ 512 px first).
 */
export function moodPick(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mood: Mood,
  count: number,
): PickedColor[] {
  const samples = gridSamples(pixels, width, height);
  const minGap = Math.hypot(width, height) * 0.06;
  const picked: Sample[] = [];
  while (picked.length < count && picked.length < samples.length) {
    let best: Sample | null = null;
    let bestScore = -Infinity;
    for (const s of samples) {
      if (picked.includes(s)) continue;
      const near = picked.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < minGap);
      const distinct =
        picked.length === 0
          ? 1
          : Math.min(1, Math.min(...picked.map((p) => labDistance(p.lab, s.lab))) / 0.12);
      const score =
        (moodScore(mood, s.l, s.c) + 0.05) * distinct * (1 - 0.5 * s.busy) - (near ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) break;
    picked.push(best);
  }
  return picked.map(({ hex, x, y }) => ({ hex, x, y }));
}

/**
 * Where each of `hexes` appears in the image (nearest OKLab match on the sample grid, preferring
 * flat areas and distinct spots), for "Make a palette" from a photo's sampled colours: ingest's
 * k-means palette has no positions. The returned `hex` is the pixel's own colour.
 */
export function locateColors(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  hexes: string[],
): PickedColor[] {
  const samples = gridSamples(pixels, width, height);
  const minGap = Math.hypot(width, height) * 0.04;
  const used: Sample[] = [];
  return hexes.map((target) => {
    const t = labOf(target);
    let best: Sample | null = null;
    let bestCost = Infinity;
    for (const s of samples) {
      const near = used.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < minGap);
      const cost = labDistance(t, s.lab) + 0.03 * s.busy + (near ? 0.05 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
    }
    if (!best) return { hex: upper(target), x: Math.floor(width / 2), y: Math.floor(height / 2) };
    used.push(best);
    return { hex: best.hex, x: best.x, y: best.y };
  });
}
