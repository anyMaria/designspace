import { parseHttpUrl } from '@/lib/urlDetect';

export type PasteKind = 'files' | 'link' | 'maybe-image' | 'note' | 'nothing';

export interface PasteSnapshot {
  fileCount: number;
  /** `text/plain` from the clipboard event, read before any `await`. */
  text: string;
  /** `text/html` from the clipboard event. */
  html: string;
}

/** What a Ctrl+V should become (Patch 3 · A1). Files win; then a lone URL; then, with no text at
 * all, maybe a picture on the clipboard (a browser copying a picture leaves `text/plain` empty);
 * otherwise the text is a note. */
export function classifyPaste({ fileCount, text }: PasteSnapshot): PasteKind {
  if (fileCount > 0) return 'files';
  const trimmed = text.trim();
  if (trimmed && parseHttpUrl(trimmed)) return 'link';
  if (!trimmed) return 'maybe-image';
  return 'note';
}
