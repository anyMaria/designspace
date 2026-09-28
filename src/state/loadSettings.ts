import type { DbRow, Platform } from '@/platform/types';
import { useSettingsStore } from './settingsStore';

/** The shape stored under `meta.settings` — kept loose (all fields optional) so a future
 * milestone can add a key without a migration. */
interface LibrarySettingsJson {
  offlineMode?: boolean;
  aiEnabled?: boolean;
}

async function readSettingsJson(platform: Platform): Promise<LibrarySettingsJson> {
  const rows = await platform.db.select<DbRow>("SELECT value FROM meta WHERE key = 'settings'");
  const raw = rows[0]?.value;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as LibrarySettingsJson;
  } catch {
    return {};
  }
}

/** Loads `meta.settings` into `useSettingsStore` — call once at startup after the library opens. */
export async function loadSettings(platform: Platform): Promise<void> {
  const parsed = await readSettingsJson(platform);
  useSettingsStore.setState({
    offlineMode: parsed.offlineMode ?? false,
    aiEnabled: parsed.aiEnabled ?? true,
  });
}

/** §7's "Offline mode, which turns [link previews and image downloads] off" (Settings →
 * Content & network). Persists immediately — no separate "Save" step, matching every other
 * Settings toggle in this app. */
export async function setOfflineMode(platform: Platform, value: boolean): Promise<void> {
  const parsed = await readSettingsJson(platform);
  parsed.offlineMode = value;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ offlineMode: value });
}

/** §4.10's Settings → AI toggle (M6-5). Turning AI off doesn't delete existing embeddings or
 * suggestions already shown — it just stops the background analysis queue and hides AI features,
 * matching Offline mode's "no separate Save step" convention. */
export async function setAiEnabled(platform: Platform, value: boolean): Promise<void> {
  const parsed = await readSettingsJson(platform);
  parsed.aiEnabled = value;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ aiEnabled: value });
}
