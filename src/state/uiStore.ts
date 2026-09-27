import { create } from 'zustand';
import type { Tool, WheelMode } from '@/canvas/input';

export type PanelTab = 'list' | 'details';

interface UiState {
  tool: Tool;
  wheelMode: WheelMode;
  panelOpen: boolean;
  panelTab: PanelTab;
  minimapOpen: boolean;
  reduceMotion: boolean;
  settingsOpen: boolean;

  setTool: (tool: Tool) => void;
  setWheelMode: (mode: WheelMode) => void;
  togglePanel: () => void;
  setPanelTab: (tab: PanelTab) => void;
  toggleMinimap: () => void;
  setReduceMotion: (v: boolean) => void;
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
  reduceMotion: false,
  settingsOpen: false,

  setTool: (tool) => set({ tool }),
  setWheelMode: (wheelMode) => set({ wheelMode }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelTab: (panelTab) => set({ panelTab }),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
