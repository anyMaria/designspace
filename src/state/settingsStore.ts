import { create } from 'zustand';

/** Library settings that live in `meta.settings` (JSON) — §7's "Library settings (vocabulary
 * order, default criteria, Offline mode) live in meta.settings". Only Offline mode is wired up
 * so far (M5); the others land with the milestones that add them. See `state/loadSettings.ts`
 * for the DB read/write. */
interface SettingsState {
  offlineMode: boolean;
}

export const useSettingsStore = create<SettingsState>(() => ({
  offlineMode: false,
}));
