import { useEffect } from 'react';
import { useUiStore } from '@/state/uiStore';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** The single-key shortcuts from §2.15 that M0's shell already has UI for. The rest (search,
 * add, undo/redo, zoom-to-*, connections…) land with the features that back them. */
export function useGlobalShortcuts() {
  const setTool = useUiStore((s) => s.setTool);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const toggleMinimap = useUiStore((s) => s.toggleMinimap);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault();
          setSettingsOpen(true);
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v':
          setTool('select');
          break;
        case 'h':
          setTool('hand');
          break;
        case 'l':
          togglePanel();
          break;
        case 'm':
          toggleMinimap();
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTool, togglePanel, toggleMinimap, setSettingsOpen]);
}
