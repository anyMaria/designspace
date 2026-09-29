/// <reference lib="webworker" />
import { extractPalette, weightedColorFamilies } from '@/lib/color';
import { computePHash } from '@/lib/phash';
import { fitLongSide } from '@/lib/geometry';

declare const self: DedicatedWorkerGlobalScope;

export interface IngestRequest {
  id: string;
  itemId: string;
  bytes: ArrayBuffer;
  mime: string;
}

export interface IngestSuccess {
  id: string;
  itemId: string;
  ok: true;
  width: number;
  height: number;
  t128: ArrayBuffer;
  t512: ArrayBuffer;
  palette: { hex: string; weight: number }[];
  colorFamilies: string[];
  phash: string;
}

export interface IngestFailure {
  id: string;
  itemId: string;
  ok: false;
  error: string;
}

export type IngestResponse = IngestSuccess | IngestFailure;

const T128 = 128;
const T512 = 512;
const PALETTE_SAMPLE = 64;
const PHASH_SAMPLE = 32;
const WEBP_QUALITY = 0.82;

async function drawnBitmap(bitmap: ImageBitmap, longSide: number): Promise<ArrayBuffer> {
  const { w, h } = fitLongSide(bitmap.width, bitmap.height, longSide);
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  return blob.arrayBuffer();
}

function sampleRgba(bitmap: ImageBitmap, size: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function sampleGrayscale(bitmap: ImageBitmap, size: number): Float64Array {
  const rgba = sampleRgba(bitmap, size);
  const out = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    // Standard luma weights.
    out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return out;
}

async function processImage(req: IngestRequest): Promise<IngestSuccess> {
  const blob = new Blob([req.bytes], { type: req.mime });
  const bitmap = await createImageBitmap(blob);
  try {
    const [t128, t512] = await Promise.all([drawnBitmap(bitmap, T128), drawnBitmap(bitmap, T512)]);
    const rgba = sampleRgba(bitmap, PALETTE_SAMPLE);
    const palette = extractPalette(rgba, 5);
    const colorFamilies = weightedColorFamilies(palette);
    const gray = sampleGrayscale(bitmap, PHASH_SAMPLE);
    const phash = computePHash(gray);

    return {
      id: req.id,
      itemId: req.itemId,
      ok: true,
      width: bitmap.width,
      height: bitmap.height,
      t128,
      t512,
      palette,
      colorFamilies,
      phash,
    };
  } finally {
    bitmap.close();
  }
}

self.onmessage = (event: MessageEvent<IngestRequest>) => {
  const req = event.data;
  processImage(req)
    .then((result) => {
      self.postMessage(result, [result.t128, result.t512]);
    })
    .catch((err: unknown) => {
      const response: IngestFailure = {
        id: req.id,
        itemId: req.itemId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    });
};
