import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyRule,
  MAX_HISTORY,
  MAX_SPOTS,
  useColorStudioStore,
  type StudioSpot,
} from './colorStudioStore';

const store = () => useColorStudioStore.getState();
const hexes = () => store().spots.map((s) => s.hex);

beforeEach(() => {
  store().openStudio({ kind: 'new' }, { name: 'x', hexes: ['#112233', '#445566', '#778899'] });
});

describe('colorStudioStore', () => {
  it('opens clean, with the first proposal in the history', () => {
    expect(store().dirty).toBe(false);
    expect(store().history).toEqual([['#112233', '#445566', '#778899']]);
    expect(store().historyIndex).toBe(0);
  });

  it('setHexes keeps locked spots and marks the palette changed', () => {
    store().toggleLock(1);
    store().setHexes(['#AAAAAA', '#BBBBBB', '#CCCCCC']);
    expect(hexes()).toEqual(['#AAAAAA', '#445566', '#CCCCCC']);
    expect(store().dirty).toBe(true);
  });

  it('add stops at the maximum; remove never removes the last spot', () => {
    for (let i = 0; i < 20; i++) store().add('#000000');
    expect(store().spots).toHaveLength(MAX_SPOTS);
    while (store().spots.length > 1) store().remove(0);
    store().remove(0);
    expect(store().spots).toHaveLength(1);
  });

  it('move reorders and follows the selected spot', () => {
    store().select(0);
    store().move(0, 2);
    expect(hexes()).toEqual(['#445566', '#778899', '#112233']);
    expect(store().selected).toBe(2);
  });

  it('generate keeps locked spots and records a proposal; going back then generating drops the forward ones', () => {
    store().toggleLock(0);
    store().generate('random', 1);
    expect(hexes()[0]).toBe('#112233');
    expect(store().history).toHaveLength(2);
    store().generate('random', 2);
    expect(store().history).toHaveLength(3);
    store().goHistory(0);
    expect(store().historyIndex).toBe(0);
    store().generate('harmonious', 3);
    expect(store().history).toHaveLength(2);
    expect(store().historyIndex).toBe(1);
  });

  it('the history never grows past its cap', () => {
    for (let i = 0; i < MAX_HISTORY + 20; i++) store().generate('random', i + 1);
    expect(store().history.length).toBe(MAX_HISTORY);
  });
});

describe('applyRule', () => {
  const spot = (id: string, hex: string, locked = false): StudioSpot => ({ id, hex, locked });

  it('leaves the base and locked spots alone, and changes the rest', () => {
    const spots = [spot('a', '#FF0000'), spot('b', '#00FF00', true), spot('c', '#0000FF')];
    const out = applyRule(spots, 0, 'complementary');
    expect(out[0].hex).toBe('#FF0000');
    expect(out[1].hex).toBe('#00FF00');
    expect(out[2].hex).not.toBe('#0000FF');
  });

  it('custom changes nothing', () => {
    const spots = [spot('a', '#FF0000'), spot('b', '#00FF00')];
    expect(applyRule(spots, 0, 'custom')).toBe(spots);
  });
});
