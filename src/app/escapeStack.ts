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

export interface EscapeStack {
  /** An open layer (menu, dialog, overlay, search bar…). Last pushed runs first. Returns `remove`. */
  push: (handler: EscapeHandler, options?: EscapeLayerOptions) => () => void;
  /** A fallback that runs only when no layer handled Esc. Lower `priority` runs first. */
  addBase: (priority: number, handler: EscapeHandler) => () => void;
  /** Runs the handlers; true when one of them handled Esc. `typing`: focus is in a text field. */
  handle: (typing?: boolean) => boolean;
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
      // While typing, only the top layer may take Esc, and only if it allows it; otherwise the
      // field keeps Esc (and the base handlers never run).
      if (typing) {
        const top = layers[layers.length - 1];
        return top !== undefined && top.allowWhileTyping && top.handler();
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
    if (stack.handle(isTyping(e.target))) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  target.addEventListener('keydown', onKeyDown as EventListener, { capture: true });
  return () => target.removeEventListener('keydown', onKeyDown as EventListener, { capture: true });
}
