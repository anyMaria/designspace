import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { wcagLuminance } from 'culori';
import { Button } from '@/design/components';
import {
  contrastInfo,
  hardToTellApart,
  nearestPassing,
  simulateCvd,
  type CvdType,
} from '@/lib/colorStudio';
import { en } from '@/i18n/en';
import { useColorStudioStore } from './colorStudioStore';

const CVD_ROWS: (CvdType | 'normal')[] = [
  'normal',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'achromatopsia',
];

/** The ratio shown rounded **down** to two decimals, so the label never says 4.50 for a fail. */
function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2).replace(/\.00$/, '');
}

/** Contrast (Patch 2 · E6): text on background from two of the palette's colours, the WCAG
 * checks, a suggestion that passes, and how the palette looks with colour-vision deficiencies. */
export function ContrastTab() {
  const spots = useColorStudioStore((s) => s.spots);
  const store = useColorStudioStore.getState;
  // Default: the darkest colour on the lightest one.
  const byLight = spots.map((s, i) => ({ i, y: wcagLuminance(s.hex) })).sort((a, b) => a.y - b.y);
  const [picked, setPicked] = useState<{ text: number; bg: number } | null>(null);
  const textIndex = Math.min(picked?.text ?? byLight[0]?.i ?? 0, spots.length - 1);
  const bgIndex = Math.min(picked?.bg ?? byLight[byLight.length - 1]?.i ?? 0, spots.length - 1);
  const text = spots[textIndex];
  const bg = spots[bgIndex];
  if (!text || !bg) return null;

  const info = contrastInfo(text.hex, bg.hex);
  const level = info.aa ? (info.aaa ? null : 'AAA') : 'AA';
  const target = info.aa ? 7 : 4.5;
  const suggestion = level ? nearestPassing(text.hex, bg.hex, target) : null;
  const lighter = suggestion ? wcagLuminance(suggestion) > wcagLuminance(text.hex) : false;

  const picker = (label: string, current: number, set: (i: number) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ width: 92, color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>{label}</span>
      {spots.map((s, i) => (
        <button
          key={s.id}
          type="button"
          aria-label={`${label} ${s.hex}`}
          aria-pressed={i === current}
          onClick={() => set(i)}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: 'none',
            background: s.hex,
            cursor: 'pointer',
            outline: i === current ? '2px solid var(--text-1)' : '1px solid var(--hairline)',
            outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );

  const rows: [string, boolean][] = [
    [en.colorStudio.aaNormal, info.aa],
    [en.colorStudio.aaLarge, info.aaLarge],
    [en.colorStudio.aaaNormal, info.aaa],
    [en.colorStudio.aaaLarge, info.aaaLarge],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {picker(en.colorStudio.text, textIndex, (i) => setPicked({ text: i, bg: bgIndex }))}
          <Button
            variant="ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setPicked({ text: bgIndex, bg: textIndex })}
          >
            <ArrowLeftRight size={14} style={{ marginRight: 6 }} />
            {en.colorStudio.swap}
          </Button>
          {picker(en.colorStudio.background, bgIndex, (i) => setPicked({ text: textIndex, bg: i }))}
          <div
            data-testid="contrast-preview"
            style={{
              width: 440,
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: 'var(--space-5)',
              borderRadius: 16,
              background: bg.hex,
              color: text.hex,
            }}
          >
            <div style={{ fontSize: 54, fontWeight: 700 }}>Aa</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{en.colorStudio.sampleHeading}</div>
            <div style={{ fontSize: 15 }}>{en.colorStudio.sampleBody}</div>
          </div>
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 300 }}
        >
          <div data-testid="contrast-ratio" style={{ fontSize: 40, fontWeight: 700 }}>
            {formatRatio(info.ratio)} : 1
          </div>
          {rows.map(([label, ok]) => (
            <div
              key={label}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
            >
              <span
                data-testid="contrast-pill"
                data-pass={ok}
                style={{
                  minWidth: 56,
                  textAlign: 'center',
                  padding: '2px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: ok ? 'var(--accent)' : 'var(--danger)',
                  color: 'var(--on-accent)',
                }}
              >
                {ok ? en.colorStudio.passes : en.colorStudio.fails}
              </span>
              <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>{label}</span>
            </div>
          ))}
          {level && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
                {en.colorStudio.findPassing(level)}
              </span>
              {suggestion ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span
                    style={{ width: 36, height: 36, borderRadius: 8, background: suggestion }}
                  />
                  <span>
                    <strong>{suggestion}</strong>{' '}
                    <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                      {formatRatio(contrastInfo(suggestion, bg.hex).ratio)} : 1 ·{' '}
                      {lighter ? en.colorStudio.lighter : en.colorStudio.darker}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={text.locked}
                    onClick={() => store().setHex(textIndex, suggestion)}
                  >
                    {text.locked ? en.colorStudio.unlockFirst : en.colorStudio.useThis}
                  </Button>
                </div>
              ) : (
                <span style={{ color: 'var(--text-3)' }}>{en.colorStudio.noPassing}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <strong>{en.colorStudio.cvdHeading}</strong>
        {CVD_ROWS.map((type) => {
          const shown = spots.map((s) => (type === 'normal' ? s.hex : simulateCvd(s.hex, type)));
          const flags = hardToTellApart(shown);
          return (
            <div
              key={type}
              data-testid="cvd-row"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
            >
              <span style={{ width: 190, color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
                {en.colorStudio.cvd[type]}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {shown.map((hex, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: 56, height: 28, borderRadius: 6, background: hex }} />
                    {flags[i] && (
                      <span
                        title={en.colorStudio.hardToTell}
                        aria-label={en.colorStudio.hardToTell}
                        style={{ color: 'var(--danger)', margin: '0 2px' }}
                      >
                        ⚠
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
