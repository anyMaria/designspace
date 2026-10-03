import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import type { Command } from './types';
import { createCreatePaletteCommand } from './paletteCommands';

export const SWATCH_SIZE = 160; // world units — §2.11's spec table: "160 × 160"
const DEFAULT_SWATCH_COLOR = '#8c8c8c';

export { createExtractPaletteCommand } from './paletteCommands';

/** The Add menu's "Swatch" (§2.3): a single new swatch, default grey, centred on the drop point.
 * A swatch is a palette with one colour (Patch 1 · C2); the owner edits it in the Details panel. */
export function createCreateSwatchCommand(
  platform: Platform,
  boardId: string,
  isLibraryBoard: boolean,
  worldX: number,
  worldY: number,
): { command: Command; item: Item } {
  return createCreatePaletteCommand(
    platform,
    boardId,
    isLibraryBoard,
    worldX,
    worldY,
    [{ hex: DEFAULT_SWATCH_COLOR }],
    '',
  );
}
