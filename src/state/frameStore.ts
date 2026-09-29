import { create } from 'zustand';
import type { Frame } from './types';

/** Frames for the *current* space, mirroring how `libraryStore.placements` works — swapped
 * wholesale by `setFrames` when switching spaces (§2.11). */
interface FrameState {
  frames: Map<string, Frame>;
  setFrames: (frames: Frame[]) => void;
  upsertFrame: (frame: Frame) => void;
  removeFrame: (id: string) => void;
}

export const useFrameStore = create<FrameState>((set) => ({
  frames: new Map(),

  setFrames: (frames) => set({ frames: new Map(frames.map((f) => [f.id, f])) }),

  upsertFrame: (frame) =>
    set((s) => {
      const frames = new Map(s.frames);
      frames.set(frame.id, frame);
      return { frames };
    }),

  removeFrame: (id) =>
    set((s) => {
      const frames = new Map(s.frames);
      frames.delete(id);
      return { frames };
    }),
}));
