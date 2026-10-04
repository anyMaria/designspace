import { useEffect, useMemo, useRef, useState } from 'react';
import type * as fontkit from 'fontkit';
import type { Platform } from '@/platform/types';
import type { FontFile, Item } from '@/state/types';
import { parseFont, readMeta, type FontMeta, type FontVariationAxis } from '@/lib/fontRender';
import { registerFontFace, weightDescriptors } from '@/lib/fontRender';
import { useFontFilesStore } from '@/state/fontFilesStore';
import { useHistoryStore } from '@/commands/history';
import { createSetFontCardCommand } from '@/commands/fontCommands';
import { cardFile, fontCardOf } from '@/lib/fontFamily';
import { Button } from '@/design/components';
import { useSettingsStore } from '@/state/settingsStore';
import { applyFontPreview } from './applyFontPreview';
import { en } from '@/i18n/en';

const NO_FILES: FontFile[] = [];
const SIZE_WATERFALL = [12, 16, 20, 24, 32, 48, 64, 96];
const GLYPH_GRID_LIMIT = 200;

function characterSetSample(font: fontkit.Font): string[] {
  const chars: string[] = [];
  for (const codePoint of font.characterSet) {
    if (codePoint < 0x20) continue; // skip control characters
    chars.push(String.fromCodePoint(codePoint));
    if (chars.length >= GLYPH_GRID_LIMIT) break;
  }
  return chars;
}

/** The Font Focus viewer / "type tester" (§2.4's checklist: "editable text, size waterfall 12–96,
 * glyph grid, sliders for variable axes, metadata"). `FocusView` mounts a fresh instance per item
 * (`key={item.id}`, same pattern as `PdfFocusViewer`), so this registers the `FontFace` once per
 * mount and tears it down on unmount — the same internal family-name convention ingest used
 * (`item.id`) means re-registering here is safe even if ingest's own temporary registration is
 * long gone by the time Focus view opens. */
export function FontFocusViewer({ platform, item }: { platform: Platform; item: Item }) {
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const previewText = useSettingsStore((s) => s.fontPreviewText);
  const [sampleText, setSampleText] = useState(previewText);
  const [glyphs, setGlyphs] = useState<string[]>([]);
  const [axisValues, setAxisValues] = useState<Record<string, number>>({});
  const fontRef = useRef<fontkit.Font | null>(null);

  const files = useFontFilesStore((s) => s.files.get(item.id)) ?? NO_FILES;
  const card = fontCardOf(item, files);
  const [fileId, setFileId] = useState<string | null>(null);
  const chosenFile = cardFile(card, files);
  const file = files.find((f) => f.id === fileId) ?? chosenFile;
  const [meta, setMeta] = useState<FontMeta | null>(item.fontMeta ?? null);
  // One face per file, named after the item and the file (never several files under one name).
  const localFamily = file ? `${item.id}-${file.id}` : item.id;

  useEffect(() => {
    let cancelled = false;
    let face: FontFace | null = null;
    void (async () => {
      const path = file?.filePath ?? item.filePath;
      if (!path) return;
      const res = await fetch(platform.media.originalUrl(path));
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const bytes = await res.arrayBuffer();
      const parsedMeta = readMeta(parseFont(bytes));
      face = await registerFontFace(bytes, localFamily, weightDescriptors(parsedMeta));
      if (cancelled) {
        document.fonts.delete(face);
        return;
      }
      const font = parseFont(bytes);
      fontRef.current = font;
      setMeta(parsedMeta);
      setGlyphs(characterSetSample(font));
      const initialAxes: Record<string, number> = {};
      for (const axis of parsedMeta.variableAxes)
        initialAxes[axis.tag] =
          axis.tag === 'wght' && file === chosenFile ? (card.wght ?? axis.default) : axis.default;
      setAxisValues(initialAxes);
      setLoadedFor(file?.id ?? '');
    })();
    return () => {
      cancelled = true;
      if (face) document.fonts.delete(face);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the chosen style changes
  }, [file?.id]);

  const variationSettings = useMemo(
    () =>
      Object.entries(axisValues)
        .map(([tag, value]) => `"${tag}" ${value}`)
        .join(', '),
    [axisValues],
  );

  const previewStyle = {
    fontFamily: `"${localFamily}"`,
    fontVariationSettings: variationSettings || undefined,
  };

  if (loadedFor !== (file?.id ?? '') || !meta) {
    return <div style={{ color: 'var(--text-2)' }}>…</div>;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        width: 'min(85vw, 720px)',
        maxHeight: '78vh',
        overflowY: 'auto',
        color: 'var(--text-1)',
        textAlign: 'left',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select
            aria-label={en.font.style}
            value={file?.id ?? ''}
            onChange={(e) => setFileId(e.target.value)}
            style={{ flex: 1 }}
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.styleName || f.fileName}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => {
              if (!file) return;
              const wght = axisValues.wght !== undefined ? Math.round(axisValues.wght) : null;
              void useHistoryStore
                .getState()
                .execute(
                  createSetFontCardCommand(platform, item.id, { ...card, fileId: file.id, wght }),
                );
            }}
          >
            {en.font.showOnCard}
          </Button>
        </div>
      )}

      <div>
        <label
          htmlFor="ds-font-sample-input"
          style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}
        >
          {en.font.sampleTextLabel}
        </label>
        <input
          id="ds-font-sample-input"
          type="text"
          value={sampleText}
          placeholder={en.font.sampleTextPlaceholder}
          onChange={(e) => setSampleText(e.target.value)}
          style={{
            width: '100%',
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--hairline)',
            background: 'var(--surface-1)',
            color: 'var(--text-1)',
          }}
        />
      </div>

      <Button
        variant="secondary"
        onClick={() => void applyFontPreview(platform, sampleText || previewText)}
      >
        {en.font.useEverywhere}
      </Button>

      {meta.variableAxes.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
            {en.font.variableAxes}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {meta.variableAxes.map((axis: FontVariationAxis) => (
              <div
                key={axis.tag}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <span style={{ width: 120, fontSize: 12, color: 'var(--text-2)' }}>
                  {axis.name}
                </span>
                <input
                  type="range"
                  min={axis.min}
                  max={axis.max}
                  value={axisValues[axis.tag] ?? axis.default}
                  step={(axis.max - axis.min) / 100 || 1}
                  onChange={(e) =>
                    setAxisValues((prev) => ({ ...prev, [axis.tag]: Number(e.target.value) }))
                  }
                  style={{ flex: 1 }}
                />
                <span
                  style={{ width: 48, fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}
                >
                  {Math.round(axisValues[axis.tag] ?? axis.default)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
          {en.font.sizeWaterfall}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {SIZE_WATERFALL.map((size) => (
            <div
              key={size}
              style={{
                ...previewStyle,
                fontSize: size,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sampleText || previewText}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
          {en.font.glyphs}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))',
            gap: 'var(--space-1)',
            maxHeight: 160,
            overflowY: 'auto',
            background: 'var(--surface-1)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2)',
          }}
        >
          {glyphs.map((g, i) => (
            <div
              key={`${g}-${i}`}
              style={{
                ...previewStyle,
                fontSize: 18,
                textAlign: 'center',
                padding: 'var(--space-1) 0',
              }}
            >
              {g}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
          {en.font.metadata}
        </div>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-1) var(--space-3)',
            margin: 0,
          }}
        >
          <dt style={{ color: 'var(--text-2)' }}>{en.font.family}</dt>
          <dd style={{ margin: 0 }}>{meta.family}</dd>
          <dt style={{ color: 'var(--text-2)' }}>{en.font.subfamily}</dt>
          <dd style={{ margin: 0 }}>{meta.subfamily || en.font.unknown}</dd>
          <dt style={{ color: 'var(--text-2)' }}>{en.font.designer}</dt>
          <dd style={{ margin: 0 }}>{meta.designer ?? en.font.unknown}</dd>
          <dt style={{ color: 'var(--text-2)' }}>{en.font.foundry}</dt>
          <dd style={{ margin: 0 }}>{meta.manufacturer ?? en.font.unknown}</dd>
          <dt style={{ color: 'var(--text-2)' }}>{en.font.license}</dt>
          <dd style={{ margin: 0 }}>{meta.license ?? en.font.unknown}</dd>
          <dt style={{ color: 'var(--text-2)' }}>{en.font.glyphs}</dt>
          <dd style={{ margin: 0 }}>{en.font.glyphCount(meta.glyphCount)}</dd>
        </dl>
      </div>
    </div>
  );
}
