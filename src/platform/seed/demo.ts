import type { Platform } from '@/platform/types';
import { newId } from '@/lib/ids';

/**
 * `?seed=demo` — about 60 procedurally-drawn items (posters, gradients, shapes, typography),
 * no external assets, so the browser dev build always has something to look at. See §4.5.
 */
const PALETTES: [string, string][] = [
  ['#E9A845', '#1E1024'],
  ['#93B89D', '#17233E'],
  ['#F0B7B3', '#2A1832'],
  ['#B7A6E8', '#1B1024'],
  ['#8CC6E6', '#20142B'],
  ['#EFE6D6', '#33203D'],
];
const WORDS = [
  'BAUHAUS',
  'SWISS',
  'MEMPHIS',
  'GRAIN',
  'DREAMY',
  'BRUTAL',
  'ECHO',
  'FORM',
  'NOSTALGIA',
  'STUDIO',
  'MOTION',
  'FIELD',
];
const SHAPES = ['circle', 'rect', 'triangle', 'lines'] as const;

function drawItem(index: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = 480;
  const h = 600;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const [fg, bg] = PALETTES[index % PALETTES.length];
  const shape = SHAPES[index % SHAPES.length];

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;

  switch (shape) {
    case 'circle': {
      const r = 80 + (index % 5) * 20;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 40, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'rect': {
      ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.4);
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.15);
      ctx.lineTo(w * 0.85, h * 0.65);
      ctx.lineTo(w * 0.15, h * 0.65);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'lines': {
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 8) * i + 40);
        ctx.lineTo(w, (h / 8) * i);
        ctx.stroke();
      }
      break;
    }
  }

  ctx.fillStyle = fg;
  ctx.font = '700 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(WORDS[index % WORDS.length], w / 2, h - 60);

  return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}

/** Idempotent: does nothing if the library already has items (e.g. a page reload). */
export async function seedDemoLibrary(
  platform: Platform,
  libraryBoardId: string,
  count = 60,
): Promise<void> {
  const [{ count: existing }] = await platform.db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM items WHERE deleted_at IS NULL',
  );
  if (existing > 0) return;

  const now = Date.now();
  const cols = Math.ceil(Math.sqrt(count) * 1.3);
  const cell = 400;

  for (let i = 0; i < count; i++) {
    const canvas = drawItem(i);
    const blob = await canvasToPng(canvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await platform.media.importBytes(`demo-${i}.png`, bytes);

    const id = newId();
    // Spread creation times so "newest/oldest" sorting and Rediscover have something to work with.
    const createdAt = new Date(now - (count - i) * 3_600_000).toISOString();
    const col = i % cols;
    const row = Math.floor(i / cols);

    await platform.db.batch([
      {
        sql: `INSERT INTO items
          (id, kind, title, file_path, file_name, file_hash, file_size, mime, width, height,
           favorite, sorted_at, status, derived_v, created_at, updated_at)
          VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'ok', 0, ?, ?)`,
        params: [
          id,
          `${WORDS[i % WORDS.length]} ${i + 1}`,
          result.relPath,
          `demo-${i}.png`,
          result.hash,
          result.size,
          result.mime,
          canvas.width,
          canvas.height,
          createdAt,
          createdAt,
        ],
      },
      {
        sql: `INSERT INTO placements (board_id, item_id, x, y, w, h, z, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [libraryBoardId, id, col * cell, row * cell, 320, 400, i, createdAt],
      },
    ]);
  }
}
