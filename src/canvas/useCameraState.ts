import { useSyncExternalStore } from 'react';
import type { Engine } from './Engine';
import type { CameraState } from './Camera';

const NULL_SUBSCRIBE = () => () => {};

/** Reactive camera state for UI that mirrors it (zoom menu, minimap) — the engine itself never
 * re-renders from React (§4.6), so this is the one place that bridges out. */
export function useCameraState(engine: Engine | null): CameraState | null {
  return useSyncExternalStore(
    engine ? (onChange) => engine.camera.subscribe(onChange) : NULL_SUBSCRIBE,
    () => engine?.camera.state ?? null,
  );
}
