import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { useToastStore } from '@/state/toastStore';
import { createCompositeCommand } from '@/commands/composite';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import {
  createCreatePaletteCommand,
  createSetSwatchColorsCommand,
} from '@/commands/paletteCommands';
import { paletteCardSize, swatchColorsOf, type SwatchColor } from '@/lib/palette';
import { importFiles } from '@/features/import/importItems';
import { en } from '@/i18n/en';
import { useColorStudioStore } from './colorStudioStore';

const GAP_TO_PHOTO = 48;

/** "Save palette" (Patch 2 · E2): a new palette (to the right of the source photo, or in the middle
 * of the view), or one undoable "Edit palette" step for an existing one. Closes the studio. */
export async function saveStudio(platform: Platform, engine: Engine | null): Promise<void> {
  const studio = useColorStudioStore.getState();
  const name = studio.name.trim() || en.colorStudio.untitled;
  const hexes = studio.spots.map((s) => s.hex);
  const { source } = studio;

  if (source.kind === 'edit') {
    const item = useLibraryStore.getState().items.get(source.itemId);
    const names = new Map<string, string | undefined>(
      item ? swatchColorsOf(item).map((c) => [c.hex.toUpperCase(), c.name]) : [],
    );
    const colors: SwatchColor[] = hexes.map((hex) => {
      const colorName = names.get(hex);
      return colorName ? { hex, name: colorName } : { hex };
    });
    const commands = [createSetSwatchColorsCommand(platform, source.itemId, colors)];
    if (item && item.title !== name) {
      commands.push(createSetItemFieldCommand(platform, source.itemId, 'title', name));
    }
    await useHistoryStore.getState().execute(createCompositeCommand('Edit palette', commands));
    studio.close();
    return;
  }

  const boardState = useBoardStore.getState();
  const boardId = boardState.currentBoardId;
  if (!boardId) return;
  const isLibraryBoard = boardState.boards.get(boardId)?.kind === 'library';
  const { w, h } = paletteCardSize(hexes.length);
  let centre = engine?.viewportCenter() ?? { x: 0, y: 0 };
  if (source.kind === 'fromPhoto') {
    const p = useLibraryStore.getState().placements.get(source.itemId);
    if (p) centre = { x: p.x + p.w + GAP_TO_PHOTO + w / 2, y: p.y + h / 2 };
  }
  const { command, item } = createCreatePaletteCommand(
    platform,
    boardId,
    isLibraryBoard,
    centre.x,
    centre.y,
    hexes.map((hex) => ({ hex })),
    name === en.colorStudio.untitled ? '' : name,
  );
  await useHistoryStore.getState().execute(command);
  // The picture is only added to the library when the owner ticked the box (Patch 2 · E4).
  if (studio.imageToAdd) {
    void importFiles(platform, [studio.imageToAdd], { x: centre.x, y: centre.y + h });
  }
  engine?.setSelection([item.id]);
  useLibraryStore.getState().setSelection([item.id]);
  useToastStore.getState().show(en.colorStudio.saved, {
    actionLabel: en.toasts.undo,
    onAction: () => void useHistoryStore.getState().undo(),
  });
  studio.close();
}
