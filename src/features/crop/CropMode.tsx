import { useEffect } from 'react';
import type { Engine } from '@/canvas/Engine';
import { useCameraState } from '@/canvas/useCameraState';
import type { Platform } from '@/platform/types';
import { useCropUiStore } from '@/state/cropUiStore';
import { useHistoryStore } from '@/commands/history';
import { createSetCropCommand } from '@/commands/itemCommands';
import { useEscape } from '@/app/useEscape';
import { en } from '@/i18n/en';

/** "Adjust crop" (Patch 2 · C3): wires the crop store to the engine's crop mode, finishes it on
 * Enter or Esc, saves the result as one undoable command, and shows the hint under the card. */
export function CropMode({ engine, platform }: { engine: Engine | null; platform: Platform }) {
  const itemId = useCropUiStore((s) => s.itemId);
  const camera = useCameraState(engine);

  useEffect(() => {
    if (!engine) return;
    const offCommit = engine.on('cropCommit', ({ id, cropX, cropY }) => {
      void useHistoryStore.getState().execute(createSetCropCommand(platform, id, { cropX, cropY }));
    });
    const offEnd = engine.on('cropEnd', () => useCropUiStore.getState().stop());
    return () => {
      offCommit();
      offEnd();
    };
  }, [engine, platform]);

  useEffect(() => {
    if (!engine) return;
    if (itemId) {
      if (!engine.startCropMode(itemId)) useCropUiStore.getState().stop();
    } else if (engine.isCropping()) {
      engine.endCropMode();
    }
  }, [engine, itemId]);

  useEscape(itemId !== null, () => engine?.endCropMode(), { allowWhileTyping: true });

  // Enter finishes too (it would otherwise open Focus view).
  useEffect(() => {
    if (!itemId) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      engine?.endCropMode();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [engine, itemId]);

  const rect = itemId && engine ? engine.getScreenRect(itemId) : null;
  if (!rect || !camera) return null;
  return (
    <div
      data-testid="crop-hint"
      style={{
        position: 'absolute',
        left: rect.x + rect.w / 2,
        top: rect.y + rect.h + 12,
        transform: 'translateX(-50%)',
        zIndex: 1,
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-1-92)',
        border: '1px solid var(--hairline)',
        color: 'var(--text-1)',
        fontSize: 'var(--text-sm)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {en.crop.hint}
    </div>
  );
}
