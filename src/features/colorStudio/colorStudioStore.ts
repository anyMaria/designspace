import { create } from 'zustand';
import { generatePalette, harmony, seededRng, type HarmonyRule } from '@/lib/colorStudio';
import { hexToHsv, hsvToHex, normalizeHex } from '@/lib/palette';

/** At most this many colours in a palette made in the studio (Patch 2 · P5); a palette that
 * already has more keeps them. */
export const MAX_SPOTS = 10;
export const MAX_HISTORY = 50;
const DEFAULT_NEW_HEX = '#8C8C8C';

export type StudioSource =
  { kind: 'new' } | { kind: 'edit'; itemId: string } | { kind: 'fromPhoto'; itemId: string };
export type StudioTab = 'wheel' | 'image' | 'generate' | 'contrast';

/** One colour of the palette being built. A locked spot never changes. */
export interface StudioSpot {
  id: string;
  hex: string;
  locked: boolean;
}

let spotCounter = 0;
const newSpot = (hex: string, locked = false): StudioSpot => ({
  id: `spot-${++spotCounter}`,
  hex: normalizeHex(hex) ?? DEFAULT_NEW_HEX,
  locked,
});

/** The spots after applying a harmony rule around `baseIndex`: the base keeps its colour, every
 * other **unlocked** spot takes the next colour of the rule, locked spots are untouched. */
export function applyRule(spots: StudioSpot[], baseIndex: number, rule: HarmonyRule): StudioSpot[] {
  const base = spots[baseIndex];
  if (!base || rule === 'custom') return spots;
  const colours = harmony(hexToHsv(base.hex), rule, spots.length);
  let next = 1;
  return spots.map((spot, i) => {
    if (i === baseIndex || spot.locked) return spot;
    const c = colours[next++];
    return c ? { ...spot, hex: hsvToHex(c.h, c.s, c.v) } : spot;
  });
}

interface ColorStudioState {
  open: boolean;
  source: StudioSource;
  tab: StudioTab;
  name: string;
  spots: StudioSpot[];
  selected: number | null;
  dirty: boolean;
  /** Generate proposals (E5), at most `MAX_HISTORY`; each is the full list of hexes. */
  history: string[][];
  historyIndex: number;
  /** The liked colour picked for comparison. */
  likedSelected: string | null;
  /** Which kind of proposals Space makes (Generate tab). */
  generateMode: 'harmonious' | 'random';

  openStudio: (
    source: StudioSource,
    init: { name: string; hexes: string[]; tab?: StudioTab },
  ) => void;
  close: () => void;
  setTab: (t: StudioTab) => void;
  setName: (n: string) => void;
  select: (i: number | null) => void;
  setHex: (i: number, hex: string) => void;
  /** Sets the unlocked spots from `hexes` (by position); locked spots keep their colour. */
  setHexes: (hexes: string[]) => void;
  toggleLock: (i: number) => void;
  add: (hex?: string) => void;
  remove: (i: number) => void;
  move: (from: number, to: number) => void;
  applyRule: (rule: HarmonyRule, baseIndex: number) => void;
  /** New colours for the unlocked spots; pushed onto the history. */
  generate: (mode: 'harmonious' | 'random', seed?: number) => void;
  goHistory: (index: number) => void;
  selectLiked: (hex: string | null) => void;
  setGenerateMode: (mode: 'harmonious' | 'random') => void;
}

export const useColorStudioStore = create<ColorStudioState>((set, get) => ({
  open: false,
  source: { kind: 'new' },
  tab: 'generate',
  name: '',
  spots: [],
  selected: null,
  dirty: false,
  history: [],
  historyIndex: 0,
  likedSelected: null,
  generateMode: 'harmonious',

  openStudio: (source, init) => {
    const spots = init.hexes.map((h) => newSpot(h));
    set({
      open: true,
      source,
      tab: init.tab ?? 'generate',
      name: init.name,
      spots,
      selected: null,
      dirty: false,
      history: [spots.map((s) => s.hex)],
      historyIndex: 0,
      likedSelected: null,
    });
  },
  close: () => set({ open: false, dirty: false }),
  setTab: (tab) => set({ tab }),
  setName: (name) => set({ name, dirty: true }),
  select: (selected) => set({ selected }),

  setHex: (i, hex) => {
    const clean = normalizeHex(hex);
    const spot = get().spots[i];
    if (!clean || !spot || spot.locked) return;
    set((s) => ({
      spots: s.spots.map((x, j) => (j === i ? { ...x, hex: clean } : x)),
      dirty: true,
    }));
  },

  setHexes: (hexes) =>
    set((s) => ({
      spots: s.spots.map((spot, i) => {
        const clean = hexes[i] ? normalizeHex(hexes[i]) : null;
        return spot.locked || !clean ? spot : { ...spot, hex: clean };
      }),
      dirty: true,
    })),

  toggleLock: (i) =>
    set((s) => ({
      spots: s.spots.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)),
      dirty: true,
    })),

  add: (hex) =>
    set((s) => {
      if (s.spots.length >= MAX_SPOTS) return s;
      return { spots: [...s.spots, newSpot(hex ?? DEFAULT_NEW_HEX)], dirty: true };
    }),

  remove: (i) =>
    set((s) => {
      if (s.spots.length <= 1 || !s.spots[i]) return s;
      const spots = s.spots.filter((_, j) => j !== i);
      let selected = s.selected;
      if (selected !== null) {
        if (selected === i) selected = null;
        else if (selected > i) selected -= 1;
      }
      return { spots, selected, dirty: true };
    }),

  move: (from, to) =>
    set((s) => {
      if (from === to || !s.spots[from] || to < 0 || to >= s.spots.length) return s;
      const spots = [...s.spots];
      const [moved] = spots.splice(from, 1);
      spots.splice(to, 0, moved);
      let selected = s.selected;
      if (selected === from) selected = to;
      else if (selected !== null && from < selected && to >= selected) selected -= 1;
      else if (selected !== null && from > selected && to <= selected) selected += 1;
      return { spots, selected, dirty: true };
    }),

  applyRule: (rule, baseIndex) =>
    set((s) => ({ spots: applyRule(s.spots, baseIndex, rule), dirty: true })),

  generate: (mode, seed = Date.now() >>> 0) => {
    const { spots, history, historyIndex } = get();
    const hexes = generatePalette(
      spots.map((s) => ({ hex: s.hex, locked: s.locked })),
      seededRng(seed),
      mode,
    );
    get().setHexes(hexes);
    const after = get().spots.map((s) => s.hex);
    // A new proposal drops any "forward" entries; the list never grows past MAX_HISTORY.
    const next = [...history.slice(0, historyIndex + 1), after].slice(-MAX_HISTORY);
    set({ history: next, historyIndex: next.length - 1 });
  },

  goHistory: (index) => {
    const { history } = get();
    const i = Math.max(0, Math.min(index, history.length - 1));
    if (!history[i]) return;
    get().setHexes(history[i]);
    set({ historyIndex: i });
  },

  selectLiked: (likedSelected) => set({ likedSelected }),
  setGenerateMode: (generateMode) => set({ generateMode }),
}));
