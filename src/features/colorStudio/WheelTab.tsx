import { useEffect, useMemo, useRef, useState } from 'react';
import { Slider } from '@/design/components';
import type { HarmonyRule } from '@/lib/colorStudio';
import { hexToHsv, hsvToHex, normalizeHex } from '@/lib/palette';
import { paintWheel, wheelHueSat, wheelPoint } from '@/features/palettes/colorWheelMath';
import { en } from '@/i18n/en';
import { applyRule, useColorStudioStore, type StudioSpot } from './colorStudioStore';

const WHEEL = 300;
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

/** Wheel (Patch 2 · E3): a colour wheel with one marker per spot, the harmony rules, and the
 * selected colour as HEX, RGB and HSB. Dragging the base marker re-runs the rule live; in Custom
 * every marker moves on its own. */
export function WheelTab() {
  const spots = useColorStudioStore((s) => s.spots);
  const selected = useColorStudioStore((s) => s.selected);
  const store = useColorStudioStore.getState;
  const [rule, setRule] = useState<HarmonyRule>('custom');
  // While a marker is dragged: which spot, and where (h, s) — committed on release.
  const [live, setLive] = useState<{ index: number; h: number; s: number } | null>(null);
  const liveRef = useRef(live);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const baseIndex = Math.min(selected ?? 0, spots.length - 1);
  const base = spots[baseIndex];
  const baseHsv = base ? hexToHsv(base.hex) : { h: 0, s: 0, v: 1 };

  // What the wheel shows: the spots, with the dragged marker (and its harmony) previewed.
  const shown: StudioSpot[] = useMemo(() => {
    if (!live) return spots;
    const dragged = spots[live.index];
    if (!dragged) return spots;
    const hsv = hexToHsv(dragged.hex);
    const moved = spots.map((s, i) =>
      i === live.index ? { ...s, hex: hsvToHex(live.h, live.s, hsv.v) } : s,
    );
    return rule !== 'custom' && live.index === baseIndex
      ? applyRule(moved, baseIndex, rule)
      : moved;
  }, [live, spots, rule, baseIndex]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paintWheel(ctx, WHEEL, baseHsv.v);
  }, [baseHsv.v]);

  function report(e: React.PointerEvent, index: number): void {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { h, s } = wheelHueSat(e.clientX - rect.left, e.clientY - rect.top, WHEEL);
    const next = { index, h, s };
    liveRef.current = next;
    setLive(next);
  }

  function release(): void {
    const l = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (!l) return;
    const spot = store().spots[l.index];
    if (!spot) return;
    store().setHex(l.index, hsvToHex(l.h, l.s, hexToHsv(spot.hex).v));
    if (rule !== 'custom' && l.index === baseIndex) store().applyRule(rule, baseIndex);
  }

  function chooseRule(next: HarmonyRule): void {
    setRule(next);
    if (next !== 'custom') store().applyRule(next, baseIndex);
  }

  function setBrightness(v: number): void {
    if (!base || base.locked) return;
    store().setHex(baseIndex, hsvToHex(baseHsv.h, baseHsv.s, v));
    if (rule !== 'custom') store().applyRule(rule, baseIndex);
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div
          ref={wheelRef}
          data-testid="studio-wheel"
          style={{ position: 'relative', width: WHEEL, height: WHEEL, touchAction: 'none' }}
        >
          <canvas ref={canvasRef} width={WHEEL} height={WHEEL} style={{ borderRadius: '50%' }} />
          <svg
            width={WHEEL}
            height={WHEEL}
            aria-hidden
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {shown.map((spot, i) => {
              const hsv = i === live?.index ? { h: live.h, s: live.s } : hexToHsv(spot.hex);
              const p = wheelPoint(hsv.h, hsv.s, WHEEL);
              return (
                <line
                  key={spot.id}
                  x1={WHEEL / 2}
                  y1={WHEEL / 2}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
              );
            })}
          </svg>
          {shown.map((spot, i) => {
            const hsv = i === live?.index ? { h: live.h, s: live.s } : hexToHsv(spot.hex);
            const p = wheelPoint(hsv.h, hsv.s, WHEEL);
            const isBase = i === baseIndex;
            const size = isBase ? 26 : 18;
            return (
              <div
                key={spot.id}
                data-testid="wheel-marker"
                role="slider"
                aria-label={en.colorStudio.spotN(i + 1)}
                aria-valuetext={spot.hex}
                aria-valuenow={Math.round(hsv.h)}
                style={{
                  position: 'absolute',
                  left: p.x - size / 2,
                  top: p.y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: spot.hex,
                  border: `${isBase ? 3 : 2}px solid #fff`,
                  boxSizing: 'border-box',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  cursor: spot.locked ? 'not-allowed' : 'grab',
                  zIndex: isBase ? 2 : 1,
                }}
                onPointerDown={(e) => {
                  if (spot.locked) return;
                  // Only the base moves under a rule; in Custom any marker moves on its own.
                  if (rule !== 'custom' && !isBase) {
                    store().select(i);
                    return;
                  }
                  e.currentTarget.setPointerCapture(e.pointerId);
                  store().select(i);
                  report(e, i);
                }}
                onPointerMove={(e) => {
                  if (liveRef.current?.index === i) report(e, i);
                }}
                onPointerUp={release}
              />
            );
          })}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
            {en.colorStudio.brightness}
          </span>
          <Slider
            aria-label={en.colorStudio.brightness}
            min={0}
            max={100}
            value={Math.round(baseHsv.v * 100)}
            onChange={(e) => setBrightness(Number(e.target.value) / 100)}
            disabled={!base || base.locked}
          />
        </label>
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 200 }}
      >
        <strong style={{ marginBottom: 'var(--space-2)' }}>{en.colorStudio.harmony}</strong>
        {RULES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === rule}
            onClick={() => chooseRule(r)}
            style={{
              textAlign: 'left',
              border: 'none',
              borderRadius: 10,
              padding: 'var(--space-2) var(--space-3)',
              background: r === rule ? 'var(--surface-1)' : 'transparent',
              color: r === rule ? 'var(--text-1)' : 'var(--text-2)',
              fontWeight: r === rule ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {en.colorStudio.rules[r]}
          </button>
        ))}
      </div>

      {base && <SelectedSpotFields index={baseIndex} spot={base} />}
    </div>
  );
}

/** The selected colour as a block with HEX, RGB and HSB fields; Enter or leaving a field applies
 * a valid value, an invalid one gets a red outline and is ignored. */
function SelectedSpotFields({ index, spot }: { index: number; spot: StudioSpot }) {
  const hsv = hexToHsv(spot.hex);
  const rgb = [1, 3, 5].map((i) => Number.parseInt(spot.hex.slice(i, i + 2), 16));
  const disabled = spot.locked;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <strong>{en.colorStudio.selectedSpot}</strong>
      <div style={{ width: 248, height: 96, borderRadius: 12, background: spot.hex }} />
      <Field
        label="HEX"
        value={spot.hex}
        disabled={disabled}
        width={120}
        onCommit={(raw) => {
          const hex = normalizeHex(raw);
          if (!hex) return false;
          useColorStudioStore.getState().setHex(index, hex);
          return true;
        }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {(['R', 'G', 'B'] as const).map((label, k) => (
          <Field
            key={label}
            label={label}
            value={String(rgb[k])}
            disabled={disabled}
            width={64}
            onCommit={(raw) => {
              const n = Number(raw);
              if (!Number.isInteger(n) || n < 0 || n > 255) return false;
              const next = [...rgb];
              next[k] = n;
              useColorStudioStore
                .getState()
                .setHex(index, `#${next.map((c) => c.toString(16).padStart(2, '0')).join('')}`);
              return true;
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {(['H', 'S', 'B'] as const).map((label, k) => {
          const current = k === 0 ? Math.round(hsv.h) : Math.round((k === 1 ? hsv.s : hsv.v) * 100);
          return (
            <Field
              key={label}
              label={label}
              value={String(current)}
              disabled={disabled}
              width={64}
              onCommit={(raw) => {
                const n = Number(raw);
                const max = k === 0 ? 360 : 100;
                if (!Number.isFinite(n) || n < 0 || n > max) return false;
                const next = { h: hsv.h, s: hsv.s, v: hsv.v };
                if (k === 0) next.h = n;
                else if (k === 1) next.s = n / 100;
                else next.v = n / 100;
                useColorStudioStore.getState().setHex(index, hsvToHex(next.h, next.s, next.v));
                return true;
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  width,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  width: number;
  disabled?: boolean;
  /** Returns false for an invalid value (the field then shows a red outline). */
  onCommit: (raw: string) => boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  function commit(): void {
    if (draft === null) return;
    const ok = onCommit(draft);
    setInvalid(!ok);
    if (ok) setDraft(null);
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)' }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <input
        aria-label={label}
        className="ds-chip-input__field"
        disabled={disabled}
        value={draft ?? value}
        style={{ width, outline: invalid ? '2px solid var(--danger)' : undefined }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        onBlur={commit}
      />
    </label>
  );
}
