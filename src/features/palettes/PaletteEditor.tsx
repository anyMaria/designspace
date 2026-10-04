import { useLibraryStore } from '@/state/libraryStore';
import { thumbUrl } from '@/lib/thumbs';
import { useEffect, useRef, useState } from 'react';
import { Pipette, Plus } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import type { Engine } from '@/canvas/Engine';
import { Button, Slider } from '@/design/components';
import { useHistoryStore } from '@/commands/history';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import { createSetSwatchColorsCommand } from '@/commands/paletteCommands';
import { useToastStore } from '@/state/toastStore';
import { hexToHsv, hsvToHex, normalizeHex, swatchColorsOf, type SwatchColor } from '@/lib/palette';
import { readableOn } from '@/canvas/decor/paletteDecor';
import { colorAtUrl } from '@/lib/pickColor';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';
import { ColorWheel } from './ColorWheel';
import { useEscape } from '@/app/useEscape';

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperLike;
  }
}

const CELL_HEIGHT_PX = 52;

function hexInt(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** The Details panel for a swatch or palette (Patch 1 · C4): name, a two-column colour grid you
 * can reorder, a colour wheel with Value, H/S/V sliders and a hex field, plus Pick from a photo,
 * Eyedropper, Remove and Copy all. Dragging a control edits local state live and commits one
 * undoable command when released. */
export function PaletteEditor({
  platform,
  item,
  engine,
}: {
  platform: Platform;
  item: Item;
  engine: Engine | null;
}) {
  const colors = swatchColorsOf(item);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, colors.length - 1);
  // While a control is being dragged: the colour being edited, not yet committed.
  const [live, setLive] = useState<{ h: number; s: number; v: number } | null>(null);
  const liveRef = useRef(live);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);

  const committedHex = colors[index]?.hex ?? '#8C8C8C';
  const hsv = live ?? hexToHsv(committedHex);
  const currentHex = live ? hsvToHex(live.h, live.s, live.v) : committedHex;
  const shownColors = colors.map((c, i) => (i === index ? { ...c, hex: currentHex } : c));

  function execute(next: SwatchColor[]): void {
    void useHistoryStore.getState().execute(createSetSwatchColorsCommand(platform, item.id, next));
  }

  function updateLive(next: { h: number; s: number; v: number }): void {
    liveRef.current = next;
    setLive(next);
    setHexDraft(null);
    setHexInvalid(false);
  }

  function commitLive(): void {
    const l = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (!l) return;
    const hex = hsvToHex(l.h, l.s, l.v);
    if (hex === committedHex.toUpperCase()) return;
    execute(colors.map((c, i) => (i === index ? { ...c, hex } : c)));
  }

  function setHex(raw: string): void {
    const hex = normalizeHex(raw);
    if (!hex) {
      setHexInvalid(true);
      return;
    }
    setHexInvalid(false);
    setHexDraft(null);
    if (hex !== committedHex.toUpperCase()) {
      execute(colors.map((c, i) => (i === index ? { ...c, hex } : c)));
    }
  }

  function addColor(hex: string = committedHex): void {
    execute([...colors, { hex }]);
    setSelected(colors.length);
  }

  function removeColor(): void {
    if (colors.length <= 1) return;
    execute(colors.filter((_, i) => i !== index));
    setSelected(Math.max(0, index - 1));
  }

  function drop(to: number): void {
    const from = dragFrom;
    setDragFrom(null);
    if (from === null || from === to) return;
    const next = [...colors];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    execute(next);
    setSelected(to);
  }

  function copyAll(): void {
    const text = colors.map((c) => c.hex).join('\n');
    void navigator.clipboard
      .writeText(text)
      .then(() => useToastStore.getState().show(en.palettes.copiedAll))
      .catch((err: unknown) => logger.warn('Copy all colors failed', err));
  }

  function pickFromPhoto(): void {
    if (!engine) return;
    setPicking(true);
    useToastStore.getState().show(en.palettes.pickHint);
    engine.startPointPick((hit) => {
      setPicking(false);
      if (!hit) return;
      void colorAtUrl(
        thumbUrl(
          platform,
          { id: hit.id, thumbV: useLibraryStore.getState().items.get(hit.id)?.thumbV },
          512,
        ),
        hit.u,
        hit.v,
      ).then((hex) => {
        if (hex) addColor(hex);
      });
    });
  }

  // Esc cancels a pending pick (a layer on the Esc stack; typing in a field keeps its Esc).
  useEscape(picking && !!engine, () => {
    engine?.cancelPointPick();
    setPicking(false);
  });
  useEffect(() => {
    if (!picking || !engine) return;
    return () => engine.cancelPointPick();
  }, [picking, engine]);

  function eyedropper(): void {
    const Dropper = window.EyeDropper;
    if (!Dropper) return;
    new Dropper()
      .open()
      .then((r) => {
        const hex = normalizeHex(r.sRGBHex);
        if (hex) addColor(hex);
      })
      .catch(() => undefined); // cancelled
  }

  const hexField = hexDraft ?? currentHex.toUpperCase();

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', overflowY: 'auto' }}
    >
      <input
        aria-label={en.palettes.name}
        placeholder={en.palettes.name}
        key={item.title}
        className="ds-chip-input__field"
        defaultValue={item.title}
        onBlur={(e) => {
          if (e.target.value !== item.title) {
            void useHistoryStore
              .getState()
              .execute(
                createSetItemFieldCommand(platform, item.id, 'title', e.target.value || null),
              );
          }
        }}
      />

      <div
        role="listbox"
        aria-label="Colors"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-2)',
          padding: 3,
        }}
      >
        {shownColors.map((c, i) => (
          <div
            key={`${i}-${c.hex}`}
            role="option"
            aria-selected={i === index}
            tabIndex={0}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelected(i);
            }}
            style={{
              height: CELL_HEIGHT_PX,
              borderRadius: 'var(--radius-input)',
              background: c.hex,
              color: readableOn(hexInt(c.hex)) === 0xffffff ? '#fff' : 'var(--canvas)',
              outline: i === index ? '2px solid var(--cream)' : 'none',
              outlineOffset: 2,
              display: 'flex',
              alignItems: 'flex-end',
              padding: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              cursor: 'grab',
              opacity: dragFrom === i ? 0.5 : 1,
            }}
          >
            {c.hex.toUpperCase()}
          </div>
        ))}
        <button
          type="button"
          onClick={() => addColor()}
          style={{
            height: CELL_HEIGHT_PX,
            borderRadius: 'var(--radius-input)',
            border: '1.5px dashed var(--text-3)',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <Plus size={16} strokeWidth={1.75} /> {en.palettes.add}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'stretch' }}>
        <ColorWheel
          h={hsv.h}
          s={hsv.s}
          v={hsv.v}
          onChange={(h, s) => updateLive({ h, s, v: hsv.v })}
          onCommit={commitLive}
        />
        <Slider
          aria-label={en.palettes.value}
          min={0}
          max={100}
          value={Math.round(hsv.v * 100)}
          onChange={(e) => updateLive({ ...hsv, v: Number(e.target.value) / 100 })}
          onPointerUp={commitLive}
          onKeyUp={commitLive}
          style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 24 }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {(
            [
              ['h', en.palettes.hue, 360, Math.round(hsv.h)],
              ['s', en.palettes.saturation, 100, Math.round(hsv.s * 100)],
              ['v', en.palettes.value, 100, Math.round(hsv.v * 100)],
            ] as const
          ).map(([key, label, max, shown]) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <span style={{ width: 12, color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
                {label}
              </span>
              <Slider
                aria-label={label}
                min={0}
                max={max}
                value={shown}
                style={{ flex: 1, minWidth: 0 }}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  updateLive({
                    h: key === 'h' ? n : hsv.h,
                    s: key === 's' ? n / 100 : hsv.s,
                    v: key === 'v' ? n / 100 : hsv.v,
                  });
                }}
                onPointerUp={commitLive}
                onKeyUp={commitLive}
              />
              <span
                style={{
                  minWidth: '3ch',
                  textAlign: 'right',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-2)',
                }}
              >
                {shown}
              </span>
            </label>
          ))}
        </div>
      </div>

      <input
        aria-label={en.palettes.hex}
        className="ds-chip-input__field"
        value={hexField}
        style={hexInvalid ? { outline: '2px solid var(--danger)' } : undefined}
        onChange={(e) => {
          setHexDraft(e.target.value);
          setHexInvalid(false);
        }}
        onBlur={(e) => setHex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setHex(e.currentTarget.value);
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={pickFromPhoto} disabled={!engine || picking}>
          {en.palettes.pickFromPhoto}
        </Button>
        {typeof window !== 'undefined' && window.EyeDropper && (
          <Button
            variant="secondary"
            icon={<Pipette size={16} strokeWidth={1.75} />}
            onClick={eyedropper}
          >
            {en.palettes.eyedropper}
          </Button>
        )}
        <Button variant="ghost" onClick={removeColor} disabled={colors.length <= 1}>
          {en.palettes.remove}
        </Button>
        <Button variant="ghost" onClick={copyAll}>
          {en.palettes.copyAll}
        </Button>
      </div>
    </div>
  );
}
