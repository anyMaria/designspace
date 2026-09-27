import { create } from 'zustand';
import type { Tool, WheelMode } from '@/canvas/input';

export type PanelTab = 'list' | 'details';
export type DotGridDensity = 'fine' | 'normal' | 'wide';
/** "System" follows the OS `prefers-reduced-motion` media query; "On"/"Off" override it —
 * Settings → Canvas (§2.14). */
export type ReduceMotionSetting = 'system' | 'on' | 'off';

interface UiState {
  tool: Tool;
  wheelMode: WheelMode;
  panelOpen: boolean;
  panelTab: PanelTab;
  minimapOpen: boolean;
  dotGridDensity: DotGridDensity;
  reduceMotion: ReduceMotionSetting;
  settingsOpen: boolean;

  setTool: (tool: Tool) => void;
  setWheelMode: (mode: WheelMode) => void;
  togglePanel: () => void;
  setPanelTab: (tab: PanelTab) => void;
  toggleMinimap: () => void;
  setDotGridDensity: (v: DotGridDensity) => void;
  setReduceMotion: (v: ReduceMotionSetting) => void;
  setSettingsOpen: (v: boolean) => void;
}

/** Machine-local UI state (not persisted to the library DB) — §5.5. Settings persistence lands
 * with M2/M7; for M0 this just holds in-memory defaults. */
export const useUiStore = create<UiState>((set) => ({
  tool: 'select',
  wheelMode: 'zoom',
  panelOpen: true,
  panelTab: 'list',
  minimapOpen: true,
  dotGridDensity: 'normal',
  reduceMotion: 'system',
  settingsOpen: false,

  setTool: (tool) => set({ tool }),
  setWheelMode: (wheelMode) => set({ wheelMode }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelTab: (panelTab) => set({ panelTab }),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  setDotGridDensity: (dotGridDensity) => set({ dotGridDensity }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
