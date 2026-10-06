import { create } from 'zustand';
import { DEFAULT_PREVIEW_TEXT } from '@/lib/fontPreview';

/** Library settings that live in `meta.settings` (JSON) — §7's "Library settings (vocabulary
 * order, default criteria, Offline mode) live in meta.settings". Only Offline mode is wired up
 * so far (M5); the others land with the milestones that add them. See `state/loadSettings.ts`
 * for the DB read/write. */
interface SettingsState {
  offlineMode: boolean;
  /** Snap while moving and resizing cards; Ctrl frees a single drag (Patch 3 · C2). */
  snapping: boolean;
  /** §5.4: an optional second folder (e.g. a OneDrive folder) that also receives a copy of every
   * backup. `null` means none configured. */
  backupExtraDestination: string | null;
  /** The text every font card shows in its own font (Patch 1 · F2). */
  fontPreviewText: string;
  /** Colours hearted in the Color studio, newest first (Patch 2 · D6). */
  likedColors: string[];
}

export const useSettingsStore = create<SettingsState>(() => ({
  offlineMode: false,
  snapping: true,
  backupExtraDestination: null,
  fontPreviewText: DEFAULT_PREVIEW_TEXT,
  likedColors: [],
}));
