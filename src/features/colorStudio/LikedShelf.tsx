import { Heart } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { Button } from '@/design/components';
import { useSettingsStore } from '@/state/settingsStore';
import { en } from '@/i18n/en';
import { useColorStudioStore } from './colorStudioStore';
import { toggleLiked } from './studioActions';

/** The kept colours on the right (Patch 2 · E2): pick one to compare it with the selected spot,
 * then Choose to put it there (or add a spot when none is selected). */
export function LikedShelf({ platform }: { platform: Platform }) {
  const liked = useSettingsStore((s) => s.likedColors);
  const likedSelected = useColorStudioStore((s) => s.likedSelected);
  const selected = useColorStudioStore((s) => s.selected);
  const spots = useColorStudioStore((s) => s.spots);
  const spot = selected !== null ? spots[selected] : undefined;
  const chosen = likedSelected && liked.includes(likedSelected) ? likedSelected : null;
  const store = useColorStudioStore.getState;

  function choose(): void {
    if (!chosen) return;
    if (selected !== null && spot && !spot.locked) store().setHex(selected, chosen);
    else if (selected === null) store().add(chosen);
  }

  return (
    <aside
      data-testid="liked-shelf"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        borderLeft: '1px solid var(--hairline)',
        background: 'var(--surface-1)',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Heart size={16} fill="var(--accent)" color="var(--accent)" aria-hidden />
        <strong>{en.colorStudio.liked}</strong>
        <span style={{ color: 'var(--text-3)' }} data-testid="liked-count">
          {liked.length}
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
        {en.colorStudio.likedHelp}
      </p>
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', flex: 1 }}
      >
        {liked.map((hex) => (
          <button
            key={hex}
            type="button"
            data-testid="liked-color"
            aria-label={hex}
            onClick={() => store().selectLiked(chosen === hex ? null : hex)}
            style={{
              border: 'none',
              padding: 0,
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                display: 'block',
                height: 56,
                borderRadius: 12,
                background: hex,
                outline: chosen === hex ? '2px solid var(--text-1)' : 'none',
                outlineOffset: 2,
              }}
            />
            {hex}
          </button>
        ))}
      </div>
      {chosen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
            {en.colorStudio.compare}
          </span>
          <div style={{ display: 'flex', height: 96, borderRadius: 12, overflow: 'hidden' }}>
            <div
              style={{
                flex: 1,
                background: spot?.hex ?? 'var(--surface-3)',
                padding: 8,
                fontSize: 11,
              }}
            >
              {spot ? `${en.colorStudio.spotN(selected! + 1)} ${spot.hex}` : ''}
            </div>
            <div style={{ flex: 1, background: chosen, padding: 8, fontSize: 11 }}>
              {en.colorStudio.liked} {chosen}
            </div>
          </div>
          <Button
            variant="primary"
            disabled={spot?.locked}
            onClick={choose}
            title={spot?.locked ? en.colorStudio.unlockFirst : undefined}
          >
            {en.colorStudio.choose}
          </Button>
          <Button variant="ghost" onClick={() => toggleLiked(platform, chosen)}>
            {en.colorStudio.unlike}
          </Button>
        </div>
      )}
    </aside>
  );
}
