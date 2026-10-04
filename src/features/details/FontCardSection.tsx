import { useState } from 'react';
import type { Platform } from '@/platform/types';
import type { FontCardOptions, FontFile, Item } from '@/state/types';
import { useFontFilesStore } from '@/state/fontFilesStore';
import { useHistoryStore } from '@/commands/history';
import { createSetFontCardCommand } from '@/commands/fontCommands';
import { cardFile, fontCardOf } from '@/lib/fontFamily';
import { fileFamily, useFontFaces } from './useFontFaces';
import { Slider } from '@/design/components';
import { en } from '@/i18n/en';

const EMPTY: FontFile[] = [];

const SIZES: ['s' | 'm' | 'l', string][] = [
  ['s', en.font.sizeS],
  ['m', en.font.sizeM],
  ['l', en.font.sizeL],
];

/** Details of a font family (Patch 2 · F4): what the card shows (style, weight, text size, text) and
 * the list of its styles. Every change is one undoable command that redraws the card. */
export function FontCardSection({ platform, item }: { platform: Platform; item: Item }) {
  const files = useFontFilesStore((s) => s.files.get(item.id)) ?? EMPTY;
  const card = fontCardOf(item, files);
  const chosen = cardFile(card, files);
  const faces = useFontFaces(platform, item.id, files);
  const axis = chosen?.axes?.find((a) => a.tag === 'wght') ?? null;
  const [live, setLive] = useState<number | null>(null);
  const [text, setText] = useState<string | null>(null);

  function run(patch: Partial<FontCardOptions>): void {
    void useHistoryStore
      .getState()
      .execute(createSetFontCardCommand(platform, item.id, { ...card, ...patch }));
  }

  function pickFile(fileId: string): void {
    const f = files.find((x) => x.id === fileId);
    const a = f?.axes?.find((x) => x.tag === 'wght');
    run({ fileId, wght: a ? Math.min(a.max, Math.max(a.min, 400)) : null });
  }

  if (files.length === 0 || !chosen) return null;
  const weight = live ?? card.wght ?? 400;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <strong style={{ fontSize: 'var(--text-sm)' }}>{en.font.onTheCard}</strong>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>{en.font.style}</span>
        <select
          aria-label={en.font.style}
          className="ds-chip-input__field"
          value={chosen.id}
          onChange={(e) => pickFile(e.target.value)}
        >
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.styleName || f.fileName}
            </option>
          ))}
        </select>
      </label>

      {axis && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ width: 56, color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
            {en.font.weight}
          </span>
          <Slider
            aria-label={en.font.weight}
            min={axis.min}
            max={axis.max}
            value={weight}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(e) => setLive(Number(e.target.value))}
            onPointerUp={() => {
              if (live !== null) run({ wght: Math.round(live) });
              setLive(null);
            }}
            onKeyUp={() => {
              if (live !== null) run({ wght: Math.round(live) });
              setLive(null);
            }}
          />
          <span style={{ minWidth: '3ch', textAlign: 'right', fontSize: 'var(--text-sm)' }}>
            {Math.round(weight)}
          </span>
        </label>
      )}

      <div
        role="group"
        aria-label={en.font.textSize}
        style={{ display: 'flex', gap: 'var(--space-1)' }}
      >
        {SIZES.map(([size, label]) => (
          <button
            key={size}
            type="button"
            aria-pressed={card.size === size}
            onClick={() => card.size !== size && run({ size })}
            className="ds-chip-input__field"
            style={{
              flex: 1,
              cursor: 'pointer',
              fontWeight: card.size === size ? 700 : 400,
              outline: card.size === size ? '2px solid var(--text-1)' : undefined,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        aria-label={en.font.cardText}
        className="ds-chip-input__field"
        placeholder={en.font.cardTextPlaceholder}
        value={text ?? card.text ?? ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const next = text.trim() === '' ? null : text;
          setText(null);
          if (next !== card.text) run({ text: next });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />

      <strong style={{ fontSize: 'var(--text-sm)' }}>{en.font.stylesHeading(files.length)}</strong>
      <div role="list" aria-label={en.font.stylesHeading(files.length)}>
        {files.map((f) => (
          <div
            key={f.id}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
              padding: 'var(--space-1) 0',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <span
              style={{
                fontFamily: faces ? `"${fileFamily(item.id, f)}"` : undefined,
                fontSize: 18,
                fontWeight: f.axes ? f.weight : undefined,
              }}
            >
              {f.styleName || f.fileName}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
              {f.id === chosen.id ? `${en.font.onTheCardBadge} · ` : ''}
              {f.weight}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
