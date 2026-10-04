import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button } from '@/design/components';
import { useHistoryStore } from '@/commands/history';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import { useToastStore } from '@/state/toastStore';
import { swatchColorsOf } from '@/lib/palette';
import { readableOn } from '@/canvas/decor/paletteDecor';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';
import { openEditPalette } from '@/features/colorStudio/openStudio';

const CELL_HEIGHT_PX = 52;

function hexInt(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function copy(text: string, message: string): void {
  void navigator.clipboard
    .writeText(text)
    .then(() => useToastStore.getState().show(message))
    .catch((err: unknown) => logger.warn('Copy colors failed', err));
}

/** The Details panel for a swatch or palette: a compact view (name, colour cells that copy their
 * hex when clicked, Open in Color studio, Copy all). Editing lives in the Color studio
 * (Patch 2 · E7). */
export function PaletteEditor({ platform, item }: { platform: Platform; item: Item }) {
  const colors = swatchColorsOf(item);

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
        role="list"
        aria-label="Colors"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-2)',
          padding: 3,
        }}
      >
        {colors.map((c, i) => (
          <button
            key={`${i}-${c.hex}`}
            type="button"
            role="listitem"
            title={en.swatches.copied(c.hex.toUpperCase())}
            onClick={() => copy(c.hex.toUpperCase(), en.swatches.copied(c.hex.toUpperCase()))}
            style={{
              height: CELL_HEIGHT_PX,
              borderRadius: 'var(--radius-input)',
              background: c.hex,
              color: readableOn(hexInt(c.hex)) === 0xffffff ? '#fff' : 'var(--canvas)',
              display: 'flex',
              alignItems: 'flex-end',
              padding: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
            }}
          >
            {c.hex.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Button variant="primary" onClick={() => openEditPalette(item)}>
          {en.colorStudio.openInStudio}
        </Button>
        <Button
          variant="ghost"
          onClick={() => copy(colors.map((c) => c.hex).join('\n'), en.palettes.copiedAll)}
        >
          {en.palettes.copyAll}
        </Button>
      </div>
    </div>
  );
}
