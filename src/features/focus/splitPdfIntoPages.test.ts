// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildSinglePagePdfs } from './splitPdfIntoPages';

function sample(): ArrayBuffer {
  const b = readFileSync('tests/e2e/fixtures/sample.pdf');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('buildSinglePagePdfs (Patch 2 · G1)', () => {
  it('makes one single-page file per chosen page, named by page number', async () => {
    const files = await buildSinglePagePdfs(sample(), 'sample.pdf', [0, 2]);
    expect(files.map((f) => f.name)).toEqual(['sample p1.pdf', 'sample p3.pdf']);
    for (const f of files) {
      const doc = await PDFDocument.load(await f.arrayBuffer());
      expect(doc.getPageCount()).toBe(1);
    }
  });
  it('gives identical bytes for the same page twice (so duplicates are recognised)', async () => {
    const [a] = await buildSinglePagePdfs(sample(), 'sample', [0]);
    const [b] = await buildSinglePagePdfs(sample(), 'sample', [0]);
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array(await b.arrayBuffer()));
  });
});
