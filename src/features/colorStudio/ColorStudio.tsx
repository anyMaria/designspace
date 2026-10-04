import { useEffect } from 'react';
import { Droplets, Image as ImageIcon, Palette, Shuffle } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { Button, Tabs } from '@/design/components';
import { openBlockingOverlay } from '@/app/overlayGate';
import { useEscape } from '@/app/useEscape';
import { en } from '@/i18n/en';
import { useColorStudioStore, type StudioTab } from './colorStudioStore';
import { PaletteStrip } from './PaletteStrip';
import { LikedShelf } from './LikedShelf';
import { saveStudio } from './saveStudio';
import { installStudioKeys } from './studioKeys';
import { WheelTab } from './WheelTab';
import { ImageTab } from './ImageTab';
import { GenerateTab } from './GenerateTab';
import { ContrastTab } from './ContrastTab';

/** The Color studio (Patch 2 · Phase E): one full-window workspace for every colour task. The
 * top bar, the palette strip at the bottom and the Liked shelf on the right are the same on every
 * tab; only the middle changes. */
export function ColorStudio({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const open = useColorStudioStore((s) => s.open);
  if (!open) return null;
  return <StudioContent platform={platform} engine={engine} />;
}

function StudioContent({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const tab = useColorStudioStore((s) => s.tab);
  const name = useColorStudioStore((s) => s.name);

  // Space means "new colors" here, so the map must not pan underneath.
  useEffect(() => openBlockingOverlay('color-studio'), []);
  useEffect(() => installStudioKeys(platform), [platform]);

  function cancel(): void {
    const { dirty, close } = useColorStudioStore.getState();
    if (dirty && !window.confirm(en.colorStudio.discardConfirm)) return;
    close();
  }
  useEscape(true, cancel, { allowWhileTyping: true });

  return (
    <div
      data-testid="color-studio"
      role="dialog"
      aria-label={en.colorStudio.title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'var(--canvas)',
        display: 'grid',
        gridTemplateColumns: '1fr 256px',
        gridTemplateRows: '64px 1fr 228px',
        minHeight: 0,
      }}
    >
      <header
        style={{
          gridColumn: '1 / 3',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: '0 var(--space-5)',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <strong className="font-display" style={{ fontSize: 'var(--text-md)' }}>
          {en.colorStudio.title}
        </strong>
        <input
          aria-label={en.colorStudio.namePlaceholder}
          className="ds-chip-input__field"
          placeholder={en.colorStudio.untitled}
          value={name}
          onChange={(e) => useColorStudioStore.getState().setName(e.target.value)}
          style={{ width: 220 }}
        />
        <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Tabs<StudioTab>
            aria-label={en.colorStudio.title}
            value={tab}
            onChange={(t) => useColorStudioStore.getState().setTab(t)}
            tabs={[
              { id: 'wheel', label: en.colorStudio.tabWheel, icon: <Palette size={14} /> },
              { id: 'image', label: en.colorStudio.tabImage, icon: <ImageIcon size={14} /> },
              { id: 'generate', label: en.colorStudio.tabGenerate, icon: <Shuffle size={14} /> },
              { id: 'contrast', label: en.colorStudio.tabContrast, icon: <Droplets size={14} /> },
            ]}
          />
        </span>
        <Button variant="ghost" onClick={cancel}>
          {en.colorStudio.cancel}
        </Button>
        <Button variant="primary" onClick={() => void saveStudio(platform, engine)}>
          {en.colorStudio.save}
        </Button>
      </header>

      <main style={{ minHeight: 0, minWidth: 0, overflow: 'auto', padding: 'var(--space-5)' }}>
        {tab === 'wheel' && <WheelTab />}
        {tab === 'image' && <ImageTab platform={platform} />}
        {tab === 'generate' && <GenerateTab />}
        {tab === 'contrast' && <ContrastTab />}
      </main>

      <div style={{ gridColumn: 1, gridRow: 3, minHeight: 0 }}>
        <PaletteStrip platform={platform} />
      </div>
      <div style={{ gridColumn: 2, gridRow: '2 / 4', minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <LikedShelf platform={platform} />
        </div>
      </div>
    </div>
  );
}
