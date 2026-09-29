import { create } from 'zustand';
import type { Platform } from '@/platform/types';
import { CLIP_MODEL } from '@/lib/ai/model';

/** The CLIP embeddings currently in memory (§4.10) — loaded once at startup from
 * `platform.embeddings.load`, then kept live as background analysis (`AiQueue`) persists new
 * vectors, so "Similar look" connections/Constellations and Find similar never need their own
 * async round trip mid-interaction. */
interface EmbeddingsState {
  vectors: Map<string, Float32Array>;
  setAll: (vectors: Map<string, Float32Array>) => void;
  upsert: (itemId: string, vector: Float32Array) => void;
}

export const useEmbeddingsStore = create<EmbeddingsState>((set) => ({
  vectors: new Map(),
  setAll: (vectors) => set({ vectors }),
  upsert: (itemId, vector) =>
    set((s) => {
      const vectors = new Map(s.vectors);
      vectors.set(itemId, vector);
      return { vectors };
    }),
}));

/** Call once at startup, after the library is open. */
export async function loadEmbeddings(platform: Platform): Promise<void> {
  const vectors = await platform.embeddings.load(CLIP_MODEL);
  useEmbeddingsStore.getState().setAll(vectors);
}
