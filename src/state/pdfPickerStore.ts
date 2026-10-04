import { create } from 'zustand';

/** What the owner chose for a multi-page PDF (Patch 2 · G2): the whole document, or some pages
 * (0-based indices) with each page's proportions (width / height). `null` = cancelled. */
export type PdfChoice =
  { kind: 'whole' } | { kind: 'pages'; pageIndices: number[]; aspects: number[] };

export interface PdfPageRequest {
  name: string;
  bytes: ArrayBuffer;
  /** `import`: also offers "Add as one PDF"; `split`: only the chosen pages. */
  mode: 'import' | 'split';
}

interface Queued extends PdfPageRequest {
  resolve: (choice: PdfChoice | null) => void;
}

interface PdfPickerState {
  /** The request being asked right now, and how many wait behind it. */
  current: PdfPageRequest | null;
  queue: Queued[];
  active: Queued | null;
  request: (req: PdfPageRequest) => Promise<PdfChoice | null>;
  /** Answers the current request and moves on to the next one. */
  answer: (choice: PdfChoice | null) => void;
}

export const usePdfPickerStore = create<PdfPickerState>((set, get) => ({
  current: null,
  queue: [],
  active: null,
  request: (req) =>
    new Promise((resolve) => {
      const queued: Queued = { ...req, resolve };
      if (get().active) set((s) => ({ queue: [...s.queue, queued] }));
      else set({ active: queued, current: req });
    }),
  answer: (choice) => {
    const { active, queue } = get();
    active?.resolve(choice);
    const [next, ...rest] = queue;
    set({ active: next ?? null, current: next ?? null, queue: rest });
  },
}));

/** Asks the owner which pages of a PDF to add. Several requests are asked one after the other. */
export function requestPdfPages(req: PdfPageRequest): Promise<PdfChoice | null> {
  return usePdfPickerStore.getState().request(req);
}
