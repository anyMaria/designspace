import { fitLongSide } from './geometry';
import { extractPalette, weightedColorFamilies, type PaletteEntry } from './color';

/** Cover-frame + palette extraction for video items (§2.4, §4.9). Unlike image ingest
 * (`ingest.worker.ts`), this runs on the *main thread*, not a Worker — decoding a specific video
 * frame needs a real `<video>` element (`createImageBitmap` can't seek a video by timestamp, and
 * Workers have no DOM), so there's no way to move this off-thread without WebCodecs + a demuxer,
 * which is a lot of machinery for one frame per import. Imports already run one file at a time
 * with a progress card, so a short main-thread stall per video is an acceptable trade — see
 * docs/DECISIONS.md. */

const T128 = 128;
const T512 = 512;
const PALETTE_SAMPLE = 64;
const WEBP_QUALITY = 0.82;
/** Where the automatic cover frame lands: 10% into the clip (never frame 0, which is often a
 * black flash or slate) — "Set cover frame" (M5-2's scrubber, still a follow-up) lets the owner
 * override it per item. */
const AUTO_POSTER_FRACTION = 0.1;

export interface VideoDerivatives {
  width: number;
  height: number;
  durationMs: number;
  posterMs: number;
  t128: ArrayBuffer;
  t512: ArrayBuffer;
  palette: PaletteEntry[];
  colorFamilies: string[];
}

function loadedMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('unsupported video codec or container'));
  });
}

function seeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('seek failed'));
  });
}

function drawFrame(video: HTMLVideoElement, longSide: number): HTMLCanvasElement {
  const { w, h } = fitLongSide(video.videoWidth, video.videoHeight, longSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A square, aspect-squashed downsample for uniform color sampling — matches
 * `ingest.worker.ts`'s `sampleRgba` for images exactly, so palette extraction behaves the same
 * regardless of kind. */
function drawSquareSample(video: HTMLVideoElement, size: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(video, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        void blob.arrayBuffer().then(resolve, reject);
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

/** Extracts duration, a cover-frame thumbnail (two sizes, matching the image pipeline's t128/
 * t512), and a palette from that frame — so a video is just as searchable/connectable by color
 * as an image, computed once rather than needing its own separate path everywhere else. Rejects
 * for any codec/container `<video>` can't decode, which callers should map to `status:
 * 'unsupported'` (§2.4's fallback tile) rather than retrying. */
export async function extractVideoDerivatives(
  bytes: ArrayBuffer,
  mime: string,
  posterMsOverride?: number,
): Promise<VideoDerivatives> {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await loadedMetadata(video);
    const durationMs = Math.round(video.duration * 1000);
    const posterMs = Math.max(
      1,
      Math.min(posterMsOverride ?? Math.round(durationMs * AUTO_POSTER_FRACTION), durationMs),
    );

    const seekDone = seeked(video);
    video.currentTime = posterMs / 1000;
    await seekDone;

    const frame128 = drawFrame(video, T128);
    const frame512 = drawFrame(video, T512);
    const [t128, t512] = await Promise.all([canvasToWebp(frame128), canvasToWebp(frame512)]);

    const rgba = drawSquareSample(video, PALETTE_SAMPLE);
    const palette = extractPalette(rgba, 5);
    const colorFamilies = weightedColorFamilies(palette);

    return {
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs,
      posterMs,
      t128,
      t512,
      palette,
      colorFamilies,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
