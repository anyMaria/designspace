import { describe, expect, it } from 'vitest';
import { converter, wcagContrast, wcagLuminance } from 'culori';
import {
  contrastInfo,
  generatePalette,
  harmony,
  hueToRyb,
  locateColors,
  moodPick,
  nearestPassing,
  rybToHue,
  seededRng,
  simulateCvd,
  type HarmonyRule,
  type Hsv,
  type Mood,
} from './colorStudio';

const toOklab = converter('oklab');
const toOklch = converter('oklch');
const HEX = /^#[0-9A-F]{6}$/;
const RULES: HarmonyRule[] = [
  'analogous',
  'monochromatic',
  'triad',
  'complementary',
  'splitComplementary',
  'square',
  'compound',
  'shades',
  'custom',
];

function dist(a: string, b: string): number {
  const p = toOklab(a)!;
  const q = toOklab(b)!;
  return Math.hypot(p.l - q.l, (p.a ?? 0) - (q.a ?? 0), (p.b ?? 0) - (q.b ?? 0));
}
const hues = (cs: Hsv[]) => cs.map((c) => Math.round(c.h));
const key = (c: Hsv) => `${c.h.toFixed(2)}/${c.s.toFixed(3)}/${c.v.toFixed(3)}`;

describe('RYB wheel mapping', () => {
  it('pins the artist anchors and round-trips', () => {
    expect(rybToHue(0)).toBe(0);
    expect(rybToHue(60)).toBe(30);
    expect(rybToHue(120)).toBe(60);
    expect(rybToHue(180)).toBe(120);
    expect(rybToHue(240)).toBe(240);
    expect(rybToHue(360)).toBe(0);
    for (let h = 0; h < 360; h += 7.5) expect(rybToHue(hueToRyb(h))).toBeCloseTo(h, 6);
  });
});

describe('harmony', () => {
  const red: Hsv = { h: 0, s: 0.9, v: 0.9 };

  it('returns `count` colours with the base first, for every rule and count', () => {
    for (const rule of RULES) {
      for (let n = 1; n <= 8; n++) {
        const out = harmony(red, rule, n);
        expect(out).toHaveLength(n);
        expect(out[0]).toEqual(red);
        for (const c of out) {
          expect(c.s).toBeGreaterThanOrEqual(0);
          expect(c.s).toBeLessThanOrEqual(1);
          expect(c.v).toBeGreaterThanOrEqual(0);
          expect(c.v).toBeLessThanOrEqual(1);
        }
        // No two colours are identical (up to 5 per rule's natural size + tones).
        expect(new Set(out.map(key)).size).toBe(n);
      }
    }
  });

  it('uses plain HSV angles on the rgb wheel', () => {
    expect(hues(harmony(red, 'complementary', 2, 'rgb'))).toEqual([0, 180]);
    expect(hues(harmony(red, 'triad', 3, 'rgb'))).toEqual([0, 120, 240]);
    expect(hues(harmony(red, 'splitComplementary', 3, 'rgb'))).toEqual([0, 150, 210]);
    expect(hues(harmony(red, 'square', 4, 'rgb'))).toEqual([0, 90, 180, 270]);
    expect(hues(harmony(red, 'analogous', 5, 'rgb'))).toEqual([0, 30, 330, 60, 300]);
    expect(hues(harmony(red, 'compound', 4, 'rgb'))).toEqual([0, 30, 180, 150]);
  });

  it("gives painters' complements on the RYB wheel (default)", () => {
    expect(hues(harmony(red, 'complementary', 2))).toEqual([0, 120]); // red ↔ green
    expect(hues(harmony({ h: 240, s: 1, v: 1 }, 'complementary', 2))).toEqual([240, 30]); // blue ↔ orange
    expect(hues(harmony({ h: 60, s: 1, v: 1 }, 'complementary', 2))).toEqual([60, 280]); // yellow ↔ violet
  });

  it('keeps s and v for hue rules, and fills extra slots with lighter/darker tones', () => {
    const out = harmony(red, 'complementary', 5, 'rgb');
    expect(hues(out)).toEqual([0, 180, 0, 180, 0]);
    expect(out[1]).toMatchObject({ s: 0.9, v: 0.9 });
    expect(out[2].v).toBeGreaterThan(red.v); // lighter tint
    expect(out[4].v).toBeLessThan(red.v); // darker tone
  });

  it('shades vary only value; monochromatic keeps the hue', () => {
    const shades = harmony(red, 'shades', 5);
    expect(new Set(shades.map((c) => c.h)).size).toBe(1);
    expect(new Set(shades.map((c) => c.s)).size).toBe(1);
    expect(new Set(shades.map((c) => c.v.toFixed(3))).size).toBe(5);
    const mono = harmony(red, 'monochromatic', 5);
    expect(mono.every((c) => c.h === 0)).toBe(true);
  });

  it('custom starts from evenly spaced hues', () => {
    expect(hues(harmony(red, 'custom', 4, 'rgb'))).toEqual([0, 90, 180, 270]);
  });

  it('dragging the base moves every colour with it (rgb wheel: same offsets)', () => {
    const a = harmony({ h: 10, s: 0.5, v: 0.8 }, 'triad', 3, 'rgb');
    const b = harmony({ h: 50, s: 0.5, v: 0.8 }, 'triad', 3, 'rgb');
    a.forEach((c, i) => expect((b[i].h - c.h + 360) % 360).toBeCloseTo(40, 6));
  });
});

describe('generatePalette', () => {
  const slots = [
    { hex: '#e9a845', locked: true },
    { hex: '#000000', locked: false },
    { hex: '#000000', locked: false },
    { hex: '#1e1024', locked: true },
    { hex: '#000000', locked: false },
  ];

  it('keeps locked colours in place and fills the rest with valid hex', () => {
    for (const mode of ['harmonious', 'random'] as const) {
      const out = generatePalette(slots, seededRng(7), mode);
      expect(out).toHaveLength(5);
      expect(out[0]).toBe('#E9A845');
      expect(out[3]).toBe('#1E1024');
      out.forEach((h) => expect(h).toMatch(HEX));
    }
  });

  it('is deterministic for a seed, and changes with the seed', () => {
    const a = generatePalette(slots, seededRng(42), 'harmonious');
    expect(generatePalette(slots, seededRng(42), 'harmonious')).toEqual(a);
    expect(generatePalette(slots, seededRng(43), 'harmonious')).not.toEqual(a);
  });

  it('never proposes near-duplicates (over many seeds, both modes, with and without locks)', () => {
    const free = Array.from({ length: 6 }, () => ({ hex: '#808080', locked: false }));
    for (const input of [slots, free]) {
      for (const mode of ['harmonious', 'random'] as const) {
        for (let seed = 1; seed <= 60; seed++) {
          const out = generatePalette(input, seededRng(seed), mode);
          let min = Infinity;
          for (let i = 0; i < out.length; i++)
            for (let j = i + 1; j < out.length; j++) min = Math.min(min, dist(out[i], out[j]));
          expect(min, `${mode} seed ${seed}: ${out.join(' ')}`).toBeGreaterThan(0.04);
        }
      }
    }
  });

  it('harmonious mode stays near the hues of the locked colour', () => {
    // One vivid locked blue: every chromatic proposal lies within 10° (jitter) + chroma-clamp
    // drift of one of the generator's rule hues anchored on that blue.
    const blue = toOklch('#2f6fde')!;
    const offsets = [0, 30, -30, 60, 120, 240, 180, 150, 210, 90, 270];
    for (let seed = 1; seed <= 30; seed++) {
      const out = generatePalette(
        [
          { hex: '#2F6FDE', locked: true },
          ...Array.from({ length: 4 }, () => ({ hex: '#000000', locked: false })),
        ],
        seededRng(seed),
        'harmonious',
      );
      for (const hex of out.slice(1)) {
        const c = toOklch(hex)!;
        if (c.c < 0.05) continue; // near-neutrals carry little hue
        const off = Math.min(
          ...offsets.map((o) => {
            const d = Math.abs(((((c.h! - (blue.h! + o)) % 360) + 540) % 360) - 180);
            return d;
          }),
        );
        expect(off, `seed ${seed} ${hex}`).toBeLessThan(16);
      }
    }
  });
});

describe('contrastInfo', () => {
  it('reports WCAG levels without rounding first', () => {
    expect(contrastInfo('#000000', '#FFFFFF')).toEqual({
      ratio: 21,
      aa: true,
      aaLarge: true,
      aaa: true,
      aaaLarge: true,
    });
    const grey = contrastInfo('#777777', '#FFFFFF'); // 4.478…
    expect(grey.ratio).toBeCloseTo(4.48, 2);
    expect(grey).toMatchObject({ aa: false, aaLarge: true, aaa: false, aaaLarge: false });
    expect(contrastInfo('#767676', '#FFFFFF')).toMatchObject({
      aa: true,
      aaaLarge: true,
      aaa: false,
    });
  });
});

describe('nearestPassing', () => {
  it('returns the colour itself when it already passes', () => {
    expect(nearestPassing('#000000', '#ffffff', 4.5)).toBe('#000000');
  });

  it('moves lightness just enough, keeping the hue', () => {
    const out = nearestPassing('#777777', '#FFFFFF', 4.5)!;
    expect(wcagContrast(out, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(dist(out, '#777777')).toBeLessThan(0.02); // #767676-ish, not black

    const accent = nearestPassing('#E9A845', '#F4EEF6', 4.5)!; // amber on a pale background
    expect(wcagContrast(accent, '#F4EEF6')).toBeGreaterThanOrEqual(4.5);
    const before = toOklch('#E9A845')!;
    const after = toOklch(accent)!;
    expect(after.l).toBeLessThan(before.l); // had to go darker
    expect(Math.abs(after.h! - before.h!)).toBeLessThan(6);
  });

  it('goes the only way that works', () => {
    // Darker than #404040 can't reach 4.5:1, so it must go lighter.
    const out = nearestPassing('#606060', '#404040', 4.5)!;
    expect(wcagLuminance(out)).toBeGreaterThan(wcagLuminance('#606060'));
    expect(wcagContrast(out, '#404040')).toBeGreaterThanOrEqual(4.5);
  });

  it('returns null when no lightness passes', () => {
    expect(nearestPassing('#777777', '#777777', 7)).toBeNull(); // black 4.69, white 4.48
  });
});

describe('simulateCvd', () => {
  it('leaves greys, black and white alone', () => {
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const) {
      for (const g of ['#000000', '#FFFFFF', '#808080']) {
        expect(dist(simulateCvd(g, type), g)).toBeLessThan(0.01);
      }
    }
  });

  it('pulls red and green together for red-green deficiencies', () => {
    const before = dist('#D62828', '#2A9D3A');
    for (const type of ['protanopia', 'deuteranopia'] as const) {
      const after = dist(simulateCvd('#D62828', type), simulateCvd('#2A9D3A', type));
      expect(after).toBeLessThan(before * 0.6);
    }
    expect(simulateCvd('#FF0000', 'protanopia')).toMatch(HEX);
  });

  it('pulls blue and green together for tritanopia', () => {
    const before = dist('#1F6FD0', '#20A080');
    const after = dist(simulateCvd('#1F6FD0', 'tritanopia'), simulateCvd('#20A080', 'tritanopia'));
    expect(after).toBeLessThan(before * 0.7);
  });

  it('achromatopsia is a grey with the same WCAG luminance', () => {
    const out = simulateCvd('#E9A845', 'achromatopsia');
    expect(out.slice(1, 3)).toBe(out.slice(3, 5));
    expect(out.slice(3, 5)).toBe(out.slice(5, 7));
    expect(wcagLuminance(out)).toBeCloseTo(wcagLuminance('#E9A845'), 2);
  });
});

/** 100 × 100 test image: five 20-px horizontal bands. */
const BANDS = ['#E8202A', '#FFF2A8', '#8A9A88', '#6E1530', '#141018'];
function bandImage(): Uint8ClampedArray {
  const w = 100;
  const px = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    const hex = BANDS[Math.floor(y / 20)];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = parseInt(hex.slice(1, 3), 16);
      px[i + 1] = parseInt(hex.slice(3, 5), 16);
      px[i + 2] = parseInt(hex.slice(5, 7), 16);
      px[i + 3] = 255;
    }
  }
  return px;
}

describe('moodPick', () => {
  const px = bandImage();

  it.each([
    ['colorful', '#E8202A'],
    ['bright', '#FFF2A8'],
    ['muted', '#8A9A88'],
    ['deep', '#6E1530'],
    ['dark', '#141018'],
  ] as [Mood, string][])('%s picks %s first, away from band edges', (mood, hex) => {
    const [first] = moodPick(px, 100, 100, mood, 1);
    expect(first.hex).toBe(hex);
    expect(BANDS[Math.floor(first.y / 20)]).toBe(hex); // the position really is that colour
    expect([0, 19]).not.toContain(first.y % 20); // not on an edge row
  });

  it('returns distinct colours at the pixels they came from, spread apart', () => {
    const picks = moodPick(px, 100, 100, 'colorful', 5);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => p.hex)).size).toBe(5);
    for (const p of picks) {
      expect(BANDS[Math.floor(p.y / 20)]).toBe(p.hex);
      expect(p.x).toBeGreaterThanOrEqual(3); // 3 % margin
      expect(p.x).toBeLessThan(97);
    }
    for (let i = 0; i < picks.length; i++)
      for (let j = i + 1; j < picks.length; j++)
        expect(Math.hypot(picks[i].x - picks[j].x, picks[i].y - picks[j].y)).toBeGreaterThan(8);
    expect(moodPick(px, 100, 100, 'colorful', 5)).toEqual(picks); // deterministic
  });

  it('ignores transparent pixels and copes with tiny images', () => {
    const clear = new Uint8ClampedArray(4 * 4 * 4);
    expect(moodPick(clear, 4, 4, 'bright', 3)).toEqual([]);
    const one = new Uint8ClampedArray([10, 200, 30, 255]);
    expect(moodPick(one, 1, 1, 'colorful', 5)).toEqual([{ hex: '#0AC81E', x: 0, y: 0 }]);
  });
});

describe('locateColors', () => {
  it("finds where a photo's sampled colours are", () => {
    const px = bandImage();
    const found = locateColors(px, 100, 100, ['#E02530', '#151119', '#8A9A88']);
    expect(found.map((f) => BANDS[Math.floor(f.y / 20)])).toEqual([
      '#E8202A',
      '#141018',
      '#8A9A88',
    ]);
    expect(found[0].hex).toBe('#E8202A'); // the pixel's own colour
  });
});
