import type { Platform } from '@/platform/types';
import type { WheelMode } from '@/canvas/input';
import { useUiStore, type DotGridDensity, type ReduceMotionSetting } from './uiStore';

/** The shape stored in `platform.machineSettings` (§5.5) — kept loose (all fields optional) so a
 * future field never needs a migration, mirroring `loadSettings.ts`'s library-settings JSON. */
interface MachineSettingsJson {
  wheelMode?: WheelMode;
  minimapOpen?: boolean;
  startFullscreen?: boolean;
  showNamesOnHover?: boolean;
  snapping?: boolean;
  dotGridDensity?: DotGridDensity;
  reduceMotion?: ReduceMotionSetting;
}

function isRelevantChange(state: MachineSettingsJson, prev: MachineSettingsJson): boolean {
  return (
    state.wheelMode !== prev.wheelMode ||
    state.minimapOpen !== prev.minimapOpen ||
    state.startFullscreen !== prev.startFullscreen ||
    state.showNamesOnHover !== prev.showNamesOnHover ||
    state.snapping !== prev.snapping ||
    state.dotGridDensity !== prev.dotGridDensity ||
    state.reduceMotion !== prev.reduceMotion
  );
}

/** Loads `settings.json`'s machine-local fields into `useUiStore` — call once at startup, before
 * `startMachineSettingsPersistence`. A missing or corrupt file just keeps the store's built-in
 * defaults. */
export async function loadMachineSettings(platform: Platform): Promise<void> {
  const raw = await platform.machineSettings.read();
  if (!raw) return;
  let parsed: MachineSettingsJson;
  try {
    parsed = JSON.parse(raw) as MachineSettingsJson;
  } catch {
    return;
  }
  useUiStore.setState({
    ...(parsed.wheelMode !== undefined && { wheelMode: parsed.wheelMode }),
    ...(parsed.minimapOpen !== undefined && { minimapOpen: parsed.minimapOpen }),
    ...(parsed.startFullscreen !== undefined && { startFullscreen: parsed.startFullscreen }),
    ...(parsed.showNamesOnHover !== undefined && { showNamesOnHover: parsed.showNamesOnHover }),
    ...(parsed.snapping !== undefined && { snapping: parsed.snapping }),
    ...(parsed.dotGridDensity !== undefined && { dotGridDensity: parsed.dotGridDensity }),
    ...(parsed.reduceMotion !== undefined && { reduceMotion: parsed.reduceMotion }),
  });
}

/** Subscribes to the machine-local `useUiStore` fields and persists them on every change. Call
 * once, after `loadMachineSettings` has applied the initial saved state (so that initial load
 * doesn't immediately trigger a redundant write-back). */
export function startMachineSettingsPersistence(platform: Platform): void {
  useUiStore.subscribe((state, prev) => {
    if (!isRelevantChange(state, prev)) return;
    const json = JSON.stringify({
      wheelMode: state.wheelMode,
      minimapOpen: state.minimapOpen,
      startFullscreen: state.startFullscreen,
      showNamesOnHover: state.showNamesOnHover,
      snapping: state.snapping,
      dotGridDensity: state.dotGridDensity,
      reduceMotion: state.reduceMotion,
    } satisfies MachineSettingsJson);
    void platform.machineSettings.write(json);
  });
}
