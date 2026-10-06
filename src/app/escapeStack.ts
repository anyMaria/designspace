import { logger } from '@/lib/logger';

/**
 * One rule for Esc (Patch 2, C1): Esc closes the topmost open thing; when nothing is open it
 * falls through to the "base" handlers (cancel a canvas mode, clear the selection, leave full
 * screen), in priority order. A handler returns true when it did something; that stops Esc.
 */
export type EscapeHandler = () => boolean;

export interface EscapeLayerOptions {
  /** Also handle Esc while a text field has focus (dialogs, search, editors, Focus view). Off by
   * default: the field gets Esc first (a combobox closes its list, a rename field cancels). */
  allowWhileTyping?: boolean;
}

/** `true`: handled. `'blur'`: focus is in a text field and nothing else wants Esc, so the field
 * should be left (Patch 3 · P2). `false`: not handled. */
export type EscapeResult = boolean | 'blur';

export interface EscapeStack {
  /** An open layer (menu, dialog, overlay, search bar…). Last pushed runs first. Returns `remove`. */
  push: (handler: EscapeHandler, options?: EscapeLayerOptions) => () => void;
  /** A fallback that runs only when no layer handled Esc. Lower `priority` runs first. */
  addBase: (priority: number, handler: EscapeHandler) => () => void;
  /** Runs the handlers; true when one of them handled Esc. `typing`: focus is in a text field. */
  handle: (typing?: boolean) => EscapeResult;
  /** Number of open layers (for tests and debugging). */
  size: () => number;
}

export function createEscapeStack(): EscapeStack {
  const layers: { handler: EscapeHandler; allowWhileTyping: boolean }[] = [];
  const base: { priority: number; order: number; handler: EscapeHandler }[] = [];
  let nextOrder = 0;

  return {
    push(handler, options) {
      const entry = { handler, allowWhileTyping: options?.allowWhileTyping ?? false };
      layers.push(entry);
      return () => {
        const i = layers.indexOf(entry);
        if (i >= 0) layers.splice(i, 1);
      };
    },
    addBase(priority, handler) {
      const entry = { priority, order: nextOrder++, handler };
      base.push(entry);
      base.sort((a, b) => a.priority - b.priority || a.order - b.order);
      return () => {
        const i = base.indexOf(entry);
        if (i >= 0) base.splice(i, 1);
      };
    },
    handle(typing = false) {
      // While typing, only the top layer may take Esc, and only if it allows it. Otherwise the
      // field gets the first chance, and if it ignores Esc the field is left ('blur'); the base
      // handlers wait for the next Esc.
      if (typing) {
        const top = layers[layers.length - 1];
        if (top !== undefined && top.allowWhileTyping && top.handler()) return true;
        return 'blur';
      }
      // Copy first: a handler usually closes its layer, which removes it during the loop.
      for (const entry of [...layers].reverse()) if (entry.handler()) return true;
      for (const entry of [...base]) if (entry.handler()) return true;
      return false;
    },
    size: () => layers.length,
  };
}

/** The app-wide instance. */
export const escapeStack = createEscapeStack();

/**
 * Installs the single Esc listener, in the capture phase on `target` (something in the app eats
 * Esc in the bubble phase). `isTyping(e.target)` says whether focus is in a text field; see
 * `handle(typing)` for what that changes.
 */
export function installEscapeListener(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  isTyping: (target: EventTarget | null) => boolean,
  stack: EscapeStack = escapeStack,
): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.isComposing) return;
    const typing = isTyping(e.target);
    const result = stack.handle(typing);
    logger.debug('esc', typing ? 'typing' : 'idle', String(result));
    if (result === true) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  // A field that takes Esc itself (a combobox list, a rename box) calls `preventDefault` or stops
  // the event before it gets here; otherwise the focused field is left, so the next Esc goes on
  // down the ladder (Patch 3 · A2).
  const onKeyDownBubble = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
    if (!isTyping(e.target)) return;
    const el = e.target;
    if (el instanceof HTMLElement) {
      el.blur();
      e.preventDefault();
    }
  };
  target.addEventListener('keydown', onKeyDown as EventListener, { capture: true });
  target.addEventListener('keydown', onKeyDownBubble as EventListener);
  return () => {
    target.removeEventListener('keydown', onKeyDown as EventListener, { capture: true });
    target.removeEventListener('keydown', onKeyDownBubble as EventListener);
  };
}
