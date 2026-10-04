// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFont, readMeta, specimenLayout } from './fontRender';

function load(name: string) {
  const buf = readFileSync(path.join(process.cwd(), 'src/design/fonts/urbanist', name));
  return readMeta(parseFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
}

describe('readMeta (Patch 2 · F1)', () => {
  it('reads the family, weight and axes of a variable upright font', () => {
    const m = load('Urbanist-VariableFont_wght.ttf');
    expect(m.family).toBe('Urbanist');
    expect(m.italic).toBe(false);
    const wght = m.variableAxes.find((a) => a.tag === 'wght');
    expect(wght).toMatchObject({ min: 100, max: 900 });
    expect(typeof m.weight).toBe('number');
  });

  it('finds the italic file by its name even when the italic angle is 0', () => {
    const m = load('Urbanist-Italic-VariableFont_wght.ttf');
    expect(m.family).toBe('Urbanist');
    expect(m.italic).toBe(true);
  });
});

describe('specimenLayout (Patch 2 · F4)', () => {
  it('gives the card numbers: padding 20, Aa 56, name 20, text S 14 / M 19 / L 26', () => {
    expect(specimenLayout('s')).toMatchObject({ pad: 20, aaSize: 56, nameSize: 20, textSize: 14 });
    expect(specimenLayout('m').textSize).toBe(19);
    expect(specimenLayout('l')).toMatchObject({ textSize: 26, maxLines: 2 });
  });
  it('two lines of the largest text still fit on the 200 high card', () => {
    const l = specimenLayout('l');
    expect(l.textBaseline + l.lineHeight).toBeLessThan(200 - l.pad / 2);
  });
});
