import { useState } from 'react';
import { Copy, GripVertical, Heart, Lock, LockOpen, Plus, X } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useSettingsStore } from '@/state/settingsStore';
import { readableTextColor } from '@/lib/color';
import { en } from '@/i18n/en';
import { MAX_SPOTS, useColorStudioStore } from './colorStudioStore';
import { copyHex, toggleLiked } from './studioActions';

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const hexInt = (hex: string) => Number.parseInt(hex.slice(1), 16);

/** The palette being built: one column per spot (Patch 2 · E2), the same on every tab. */
export function PaletteStrip({ platform }: { platform: Platform }) {
  const spots = useColorStudioStore((s) => s.spots);
  const selected = useColorStudioStore((s) => s.selected);
  const liked = useSettingsStore((s) => s.likedColors);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const store = useColorStudioStore.getState;
  const full = spots.length >= MAX_SPOTS;

  return (
    <div
      data-testid="palette-strip"
      style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-4)', minHeight: 0 }}
    >
      {spots.map((spot, i) => {
        const ink = css(readableTextColor(hexInt(spot.hex)));
        const isLiked = liked.includes(spot.hex.toUpperCase());
        const isSelected = selected === i;
        const showTools = isSelected || hover === i;
        const disc = (on: boolean): React.CSSProperties =>
          on ? { background: ink, color: spot.hex, borderRadius: '50%' } : { borderRadius: '50%' };
        const tool = (
          label: string,
          icon: React.ReactNode,
          onClick: () => void,
          alwaysOn = false,
        ) =>
          (showTools || alwaysOn) && (
            <button
              type="button"
              aria-label={label}
              title={label}
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              style={{
                width: 28,
                height: 28,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: alwaysOn ? undefined : ink,
                background: alwaysOn ? undefined : 'rgba(255,255,255,0.18)',
                ...disc(alwaysOn),
              }}
            >
              {icon}
            </button>
          );
        return (
          <div
            key={spot.id}
            data-testid="studio-spot"
            data-hex={spot.hex}
            data-locked={spot.locked || undefined}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) store().move(dragFrom, i);
              setDragFrom(null);
            }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => store().select(isSelected ? null : i)}
            style={{
              flex: 1,
              minWidth: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 'var(--space-3)',
              borderRadius: 16,
              background: spot.hex,
              color: ink,
              boxShadow: 'var(--shadow-card)',
              outline: isSelected ? '3px solid var(--text-1)' : 'none',
              outlineOffset: 3,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28 }}>
              <GripVertical size={16} strokeWidth={1.75} aria-hidden style={{ opacity: 0.6 }} />
              <span style={{ flex: 1 }} />
              {tool(
                spot.locked ? en.colorStudio.unlock : en.colorStudio.lock,
                spot.locked ? <Lock size={14} /> : <LockOpen size={14} />,
                () => store().toggleLock(i),
                spot.locked,
              )}
              {tool(
                isLiked ? en.colorStudio.unlike : en.colorStudio.like,
                <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />,
                () => toggleLiked(platform, spot.hex),
                isLiked,
              )}
              {tool(
                en.colorStudio.copy,
                <Copy size={14} />,
                () => void copyHex(platform, spot.hex),
              )}
              {tool(en.colorStudio.remove, <X size={14} />, () => store().remove(i))}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{spot.hex}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                {spot.locked ? en.colorStudio.locked : isLiked ? en.colorStudio.liked : ''}
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        aria-label={en.colorStudio.add}
        title={en.colorStudio.add}
        disabled={full}
        onClick={() => {
          const sel = store().selected;
          store().add(sel !== null ? lighten(store().spots[sel]?.hex) : undefined);
        }}
        style={{
          width: 56,
          flex: 'none',
          borderRadius: 16,
          border: '2px dashed var(--hairline)',
          background: 'transparent',
          color: 'var(--text-2)',
          cursor: full ? 'not-allowed' : 'pointer',
          opacity: full ? 0.4 : 1,
        }}
      >
        <Plus size={20} />
      </button>
    </div>
  );
}

/** The selected colour, a little lighter (the new spot's starting point). */
function lighten(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const n = hexInt(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.25);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`.toUpperCase();
}
