import { create } from 'zustand';

export type AiStatus = 'off' | 'loading' | 'ready' | 'error';

interface AiStatusState {
  status: AiStatus;
  error: string | null;
  provider: 'clip' | 'fake' | null;
  set: (patch: Partial<Pick<AiStatusState, 'status' | 'error' | 'provider'>>) => void;
}

/** What the AI helper is really doing (Patch 2 · A6), so Settings → AI tells the truth. */
export const useAiStatusStore = create<AiStatusState>((set) => ({
  status: 'off',
  error: null,
  provider: null,
  set: (patch) => set(patch),
}));
