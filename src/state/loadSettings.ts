import type { DbRow, Platform } from '@/platform/types';
import { useSettingsStore } from './settingsStore';
import { DEFAULT_PREVIEW_TEXT } from '@/lib/fontPreview';

/** The shape stored under `meta.settings` — kept loose (all fields optional) so a future
 * milestone can add a key without a migration. */
interface LibrarySettingsJson {
  offlineMode?: boolean;
  snapping?: boolean;
  backupExtraDestination?: string | null;
  fontPreviewText?: string;
  likedColors?: string[];
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
    snapping: parsed.snapping ?? true,
    backupExtraDestination: parsed.backupExtraDestination ?? null,
    fontPreviewText: parsed.fontPreviewText?.trim() || DEFAULT_PREVIEW_TEXT,
    likedColors: cleanLikedColors(parsed.likedColors ?? []),
  });
}

export const MAX_LIKED_COLORS = 60;

/** Uppercase `#RRGGBB`, no duplicates, newest first, at most `MAX_LIKED_COLORS`. */
export function cleanLikedColors(hexes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hexes) {
    const hex = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.slice(0, MAX_LIKED_COLORS);
}

/** Patch 2 · E2 (D6): the colours hearted in the Color studio are kept per library, until removed.
 * A preference like the font preview text, not a Command (nothing to undo on the map). */
export async function setLikedColors(platform: Platform, hexes: string[]): Promise<void> {
  const liked = cleanLikedColors(hexes);
  const parsed = await readSettingsJson(platform);
  parsed.likedColors = liked;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ likedColors: liked });
}

/** Patch 1 · F2: the text shown on every font card. Persisted like every other library setting;
 * the caller re-renders the specimens (`rerenderFontSpecimens`) when the owner asks for it. */
export async function setFontPreviewText(platform: Platform, value: string): Promise<void> {
  const text = value.trim() || DEFAULT_PREVIEW_TEXT;
  const parsed = await readSettingsJson(platform);
  parsed.fontPreviewText = text;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ fontPreviewText: text });
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

/** Settings → Canvas → "Snap while moving and resizing" (Patch 3 · C2): a library setting, saved at
 * once, like Offline mode. */
export async function setSnapping(platform: Platform, value: boolean): Promise<void> {
  const parsed = await readSettingsJson(platform);
  parsed.snapping = value;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ snapping: value });
}

/** §5.4's "optional extra destination" for backups (e.g. a OneDrive folder) — `null` clears it.
 * Persisted immediately, same "no separate Save step" convention as every other Settings toggle
 * here. */
export async function setBackupExtraDestination(
  platform: Platform,
  value: string | null,
): Promise<void> {
  const parsed = await readSettingsJson(platform);
  parsed.backupExtraDestination = value;
  await platform.db.execute(
    "INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(parsed)],
  );
  useSettingsStore.setState({ backupExtraDestination: value });
}
