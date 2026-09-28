import { create } from 'zustand';

/** Library settings that live in `meta.settings` (JSON) — §7's "Library settings (vocabulary
 * order, default criteria, Offline mode) live in meta.settings". Only Offline mode is wired up
 * so far (M5); the others land with the milestones that add them. See `state/loadSettings.ts`
 * for the DB read/write. */
interface SettingsState {
  offlineMode: boolean;
  /** §4.10: AI (background analysis, suggestions, Find similar, search by meaning). On by
   * default — an owner who wants it off finds the switch in Settings → AI (M6-5). */
  aiEnabled: boolean;
  /** §5.4: an optional second folder (e.g. a OneDrive folder) that also receives a copy of every
   * backup. `null` means none configured. */
  backupExtraDestination: string | null;
}

export const useSettingsStore = create<SettingsState>(() => ({
  offlineMode: false,
  aiEnabled: true,
  backupExtraDestination: null,
}));
