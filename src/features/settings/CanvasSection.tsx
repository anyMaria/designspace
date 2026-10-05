import type { ReactNode } from 'react';
import { Tabs, Toggle } from '@/design/components';
import { useUiStore } from '@/state/uiStore';
import { en } from '@/i18n/en';
import type { Platform } from '@/platform/types';
import { useSettingsStore } from '@/state/settingsStore';
import { applyFontPreview } from '@/features/focus/applyFontPreview';

/** Settings → Canvas (§2.14): mouse wheel mode, dot grid density, minimap on/off, reduce motion. */
export function CanvasSection({ platform }: { platform: Platform }) {
  const fontPreview = useSettingsStore((s) => s.fontPreviewText);
  const wheelMode = useUiStore((s) => s.wheelMode);
  const setWheelMode = useUiStore((s) => s.setWheelMode);
  const dotGridDensity = useUiStore((s) => s.dotGridDensity);
  const setDotGridDensity = useUiStore((s) => s.setDotGridDensity);
  const minimapOpen = useUiStore((s) => s.minimapOpen);
  const toggleMinimap = useUiStore((s) => s.toggleMinimap);
  const startFullscreen = useUiStore((s) => s.startFullscreen);
  const setStartFullscreen = useUiStore((s) => s.setStartFullscreen);
  const showNames = useUiStore((s) => s.showNamesOnHover);
  const setShowNames = useUiStore((s) => s.setShowNamesOnHover);
  const snapping = useUiStore((s) => s.snapping);
  const setSnapping = useUiStore((s) => s.setSnapping);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const setReduceMotion = useUiStore((s) => s.setReduceMotion);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Field label={en.settings.canvas.mouseWheel}>
        <Tabs
          aria-label={en.settings.canvas.mouseWheel}
          value={wheelMode}
          onChange={setWheelMode}
          tabs={[
            { id: 'zoom', label: en.settings.canvas.wheelZoom },
            { id: 'pan', label: en.settings.canvas.wheelPan },
          ]}
        />
      </Field>

      <Field label={en.settings.canvas.dotGrid}>
        <Tabs
          aria-label={en.settings.canvas.dotGrid}
          value={dotGridDensity}
          onChange={setDotGridDensity}
          tabs={[
            { id: 'fine', label: en.settings.canvas.dotFine },
            { id: 'normal', label: en.settings.canvas.dotNormal },
            { id: 'wide', label: en.settings.canvas.dotWide },
          ]}
        />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{en.settings.canvas.minimap}</span>
        <Toggle checked={minimapOpen} onChange={toggleMinimap} label={en.settings.canvas.minimap} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{en.fullscreen.setting}</span>
        <Toggle
          checked={startFullscreen}
          onChange={() => setStartFullscreen(!startFullscreen)}
          label={en.fullscreen.setting}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{en.settings.canvas.showNames}</span>
        <Toggle
          checked={showNames}
          onChange={() => setShowNames(!showNames)}
          label={en.settings.canvas.showNames}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          {en.settings.canvas.snapping}
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            {en.settings.canvas.snappingHint}
          </span>
        </span>
        <Toggle
          checked={snapping}
          onChange={() => setSnapping(!snapping)}
          label={en.settings.canvas.snapping}
        />
      </div>

      <Field label={en.font.previewSetting}>
        <input
          aria-label={en.font.previewSetting}
          key={fontPreview}
          className="ds-chip-input__field"
          defaultValue={fontPreview}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== fontPreview) void applyFontPreview(platform, next);
          }}
        />
      </Field>

      <Field label={en.settings.canvas.reduceMotion}>
        <Tabs
          aria-label={en.settings.canvas.reduceMotion}
          value={reduceMotion}
          onChange={setReduceMotion}
          tabs={[
            { id: 'system', label: en.settings.canvas.motionSystem },
            { id: 'on', label: en.settings.canvas.motionOn },
            { id: 'off', label: en.settings.canvas.motionOff },
          ]}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      {children}
    </div>
  );
}
