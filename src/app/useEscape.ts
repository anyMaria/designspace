import { useEffect, useRef } from 'react';
import { escapeStack } from './escapeStack';

/** Registers an open layer (dialog, overlay, menu…) on the app's Esc stack while `active`
 * (Patch 2 · C1). Pushed once when `active` turns true and removed when it turns false or on
 * unmount; `onEscape` lives in a ref, so inline closures never re-push (and never lose the layer's
 * place in the stack). */
export function useEscape(
  active: boolean,
  onEscape: () => void,
  opts?: { allowWhileTyping?: boolean },
): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  const allowWhileTyping = opts?.allowWhileTyping ?? false;
  useEffect(() => {
    if (!active) return;
    return escapeStack.push(
      () => {
        handler.current();
        return true;
      },
      { allowWhileTyping },
    );
  }, [active, allowWhileTyping]);
}
