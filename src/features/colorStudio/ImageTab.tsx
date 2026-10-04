import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FolderOpen, Images } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { Button, Tabs } from '@/design/components';
import { useLibraryStore } from '@/state/libraryStore';
import { thumbUrl } from '@/lib/thumbs';
import { IMAGE_EXTENSIONS } from '@/lib/fileKinds';
import { locateColors, moodPick, type Mood, type PickedColor } from '@/lib/colorStudio';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';
import { useColorStudioStore } from './colorStudioStore';
import { loadPixels, type LoadedPixels } from './imagePixels';

const MOODS: Mood[] = ['colorful', 'bright', 'muted', 'deep', 'dark'];
const BOX_W = 640;
const BOX_H = 400;
const LOUPE = 104;
const LOUPE_SOURCE = 9; // source pixels across the loupe
const PICTURE_KINDS = new Set(['image', 'video', 'pdf', 'link']);

type Positions = Record<string, { x: number; y: number }>;

/** From an image (Patch 2 · E4): colors picked from a picture, with a numbered eyedropper per
 * unlocked spot to drag around. The picture is only used for its colors; it is added to the
 * library only if the owner ticks the box. */
export function ImageTab({ platform }: { platform: Platform }) {
  const source = useColorStudioStore((s) => s.source);
  const spots = useColorStudioStore((s) => s.spots);
  const store = useColorStudioStore.getState;
  const [img, setImg] = useState<LoadedPixels | null>(null);
  const [mood, setMood] = useState<Mood>('colorful');
  const [positions, setPositions] = useState<Positions>({});
  const [fromLibraryOpen, setFromLibraryOpen] = useState(false);
  const [cameFromLibrary, setCameFromLibrary] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [alsoAdd, setAlsoAdd] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draw the picture into its canvas whenever a new one loads.
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')?.drawImage(img.bitmap, 0, 0, img.width, img.height);
  }, [img]);

  const display = useMemo(() => {
    if (!img) return { w: BOX_W, h: BOX_H };
    const scale = Math.min(BOX_W / img.width, BOX_H / img.height);
    return { w: Math.round(img.width * scale), h: Math.round(img.height * scale) };
  }, [img]);

  /** Fills the unlocked spots (and their droppers) from the loaded picture. */
  function pick(loaded: LoadedPixels, how: 'locate' | Mood): void {
    const current = store().spots;
    const unlockedIdx = current.map((s, i) => (s.locked ? -1 : i)).filter((i) => i >= 0);
    const picks: PickedColor[] =
      how === 'locate'
        ? locateColors(
            loaded.pixels,
            loaded.width,
            loaded.height,
            current.map((s) => s.hex),
          )
        : moodPick(loaded.pixels, loaded.width, loaded.height, how, unlockedIdx.length);
    const hexes = current.map((s) => s.hex);
    const next: Positions = {};
    unlockedIdx.forEach((spotIndex, k) => {
      const p = how === 'locate' ? picks[spotIndex] : picks[k];
      if (!p) return;
      hexes[spotIndex] = p.hex;
      next[current[spotIndex].id] = { x: p.x, y: p.y };
    });
    store().setHexes(hexes);
    setPositions(next);
  }

  async function handleBlob(
    blob: Blob,
    opts: { file: File | null; fromLibrary: boolean; how: 'locate' | Mood },
  ): Promise<void> {
    try {
      setError(null);
      const loaded = await loadPixels(blob);
      setImg(loaded);
      setFile(opts.file);
      setCameFromLibrary(opts.fromLibrary);
      setAlsoAdd(false);
      store().setImageToAdd(null);
      pick(loaded, opts.how);
    } catch (err) {
      logger.warn('Reading the picture failed', err);
      setError(en.colorStudio.imageFailed);
    }
  }

  // "Make a palette" from a photo: the photo is already known; the droppers start on its colors.
  useEffect(() => {
    if (source.kind !== 'fromPhoto') return;
    const item = useLibraryStore.getState().items.get(source.itemId);
    if (!item) return;
    let cancelled = false;
    void fetch(thumbUrl(platform, item, 512))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!cancelled) void handleBlob(blob, { file: null, fromLibrary: true, how: 'locate' });
      })
      .catch((err: unknown) => logger.warn('Loading the photo failed', err));
    return () => {
      cancelled = true;
    };
    // Once per opening of the studio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openImage(): Promise<void> {
    if (platform.kind === 'tauri') {
      const paths = await platform.dialogs.openFiles([
        { name: en.addMenu.filterImages, extensions: IMAGE_EXTENSIONS.filter((e) => e !== 'svg') },
      ]);
      if (paths.length === 0) return;
      const bytes = await platform.media.readImage(paths[0]);
      const name = paths[0].split(/[\\/]/).pop() ?? 'image';
      await handleBlob(new Blob([bytes]), {
        file: new File([bytes], name),
        fromLibrary: false,
        how: mood,
      });
    } else {
      fileInputRef.current?.click();
    }
  }

  async function paste(): Promise<void> {
    const bytes = await platform.clipboard.readImage();
    if (!bytes) {
      setError(en.colorStudio.nothingToPaste);
      return;
    }
    const blob = new Blob([bytes.slice()], { type: 'image/png' });
    await handleBlob(blob, {
      file: new File([blob], 'pasted-image.png', { type: 'image/png' }),
      fromLibrary: false,
      how: mood,
    });
  }

  async function fromLibrary(id: string): Promise<void> {
    const item = useLibraryStore.getState().items.get(id);
    if (!item) return;
    setFromLibraryOpen(false);
    const res = await fetch(thumbUrl(platform, item, 512));
    if (res.ok) await handleBlob(await res.blob(), { file: null, fromLibrary: true, how: mood });
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type.startsWith('image/')) {
      void handleBlob(dropped, { file: dropped, fromLibrary: false, how: mood });
    }
  }

  function chooseMood(next: Mood): void {
    setMood(next);
    if (img) pick(img, next);
  }

  function sampleAt(e: React.PointerEvent, id: string, index: number): void {
    if (!img) return;
    const rect = imageCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(
      0,
      Math.min(img.width - 1, Math.round(((e.clientX - rect.left) / rect.width) * img.width)),
    );
    const y = Math.max(
      0,
      Math.min(img.height - 1, Math.round(((e.clientY - rect.top) / rect.height) * img.height)),
    );
    const i = (y * img.width + x) * 4;
    const hex = `#${[0, 1, 2]
      .map((k) => img.pixels[i + k].toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
    store().setHex(index, hex);
    setPositions((p) => ({ ...p, [id]: { x, y } }));
    drawLoupe(x, y);
  }

  function drawLoupe(x: number, y: number): void {
    const loupe = loupeRef.current;
    const source = imageCanvasRef.current;
    const ctx = loupe?.getContext('2d');
    if (!loupe || !source || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    const half = Math.floor(LOUPE_SOURCE / 2);
    ctx.drawImage(source, x - half, y - half, LOUPE_SOURCE, LOUPE_SOURCE, 0, 0, LOUPE, LOUPE);
    const cell = LOUPE / LOUPE_SOURCE;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(half * cell, half * cell, cell, cell);
  }

  const libraryItems = useMemo(() => {
    const { items, placements } = useLibraryStore.getState();
    return [...placements.keys()]
      .map((id) => items.get(id))
      .filter((i) => !!i && !i.deletedAt && i.status === 'ok' && PICTURE_KINDS.has(i.kind))
      .slice(0, 80);
    // The library does not change while the studio is open on this tab.
  }, []);

  return (
    <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: 200 }}>
        <Button variant="secondary" onClick={() => void openImage()}>
          <FolderOpen size={14} style={{ marginRight: 6 }} />
          {en.colorStudio.openImage}
        </Button>
        <Button variant="secondary" onClick={() => void paste()}>
          <ClipboardPaste size={14} style={{ marginRight: 6 }} />
          {en.colorStudio.paste}
        </Button>
        <Button variant="secondary" onClick={() => setFromLibraryOpen((v) => !v)}>
          <Images size={14} style={{ marginRight: 6 }} />
          {en.colorStudio.fromLibrary}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label={en.colorStudio.openImage}
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (picked) void handleBlob(picked, { file: picked, fromLibrary: false, how: mood });
          }}
        />
        <span
          style={{
            color: 'var(--text-2)',
            fontSize: 'var(--text-sm)',
            marginTop: 'var(--space-3)',
          }}
        >
          {en.colorStudio.mood}
        </span>
        <Tabs
          aria-label={en.colorStudio.mood}
          value={mood}
          onChange={chooseMood}
          tabs={MOODS.map((m) => ({ id: m, label: en.colorStudio.moods[m] }))}
        />
        {img && !cameFromLibrary && (
          <label
            style={{ display: 'flex', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}
          >
            <input
              type="checkbox"
              checked={alsoAdd}
              onChange={(e) => {
                setAlsoAdd(e.target.checked);
                store().setImageToAdd(e.target.checked ? file : null);
              }}
            />
            {en.colorStudio.alsoAddImage}
          </label>
        )}
        {error && (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{error}</span>
        )}
      </div>

      <div
        data-testid="studio-image-area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        style={{
          position: 'relative',
          width: BOX_W,
          maxWidth: '100%',
          minHeight: BOX_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {fromLibraryOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              background: 'var(--surface-1)',
              borderRadius: 12,
              padding: 'var(--space-3)',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
              gap: 8,
              alignContent: 'start',
            }}
          >
            {libraryItems.map((item) =>
              item ? (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.title || item.fileName || item.kind}
                  onClick={() => void fromLibrary(item.id)}
                  style={{
                    border: 'none',
                    padding: 0,
                    borderRadius: 8,
                    overflow: 'hidden',
                    aspectRatio: '1',
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src={thumbUrl(platform, item, 128)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              ) : null,
            )}
          </div>
        )}
        {!img && (
          <div style={{ color: 'var(--text-3)', textAlign: 'center' }}>
            {en.colorStudio.dropImage}
          </div>
        )}
        <div style={{ position: 'relative', display: img ? 'block' : 'none' }}>
          <canvas
            ref={imageCanvasRef}
            data-testid="studio-image"
            style={{ width: display.w, height: display.h, borderRadius: 12, display: 'block' }}
          />
          {img &&
            spots.map((spot, index) => {
              const p = positions[spot.id];
              if (!p || spot.locked) return null;
              const left = (p.x / img.width) * display.w;
              const top = (p.y / img.height) * display.h;
              return (
                <div
                  key={spot.id}
                  data-testid="dropper"
                  role="slider"
                  aria-label={en.colorStudio.spotN(index + 1)}
                  aria-valuetext={spot.hex}
                  style={{
                    position: 'absolute',
                    left: left - 15,
                    top: top - 15,
                    width: 30,
                    height: 30,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    border: '3px solid #fff',
                    background: spot.hex,
                    boxShadow: '0 1px 6px rgba(0,0,0,0.6)',
                    cursor: 'grab',
                    touchAction: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    textShadow: '0 0 3px rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging({ id: spot.id, index });
                    sampleAt(e, spot.id, index);
                  }}
                  onPointerMove={(e) => {
                    if (dragging?.id === spot.id) sampleAt(e, spot.id, index);
                  }}
                  onPointerUp={() => setDragging(null)}
                >
                  {index + 1}
                  {dragging?.id === spot.id && (
                    <canvas
                      ref={loupeRef}
                      width={LOUPE}
                      height={LOUPE}
                      style={{
                        position: 'absolute',
                        left: 15 - LOUPE / 2,
                        bottom: 40,
                        width: LOUPE,
                        height: LOUPE,
                        borderRadius: '50%',
                        border: '3px solid #fff',
                        pointerEvents: 'none',
                        background: '#000',
                      }}
                    />
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
