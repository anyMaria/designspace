import { useEffect } from 'react';
import { useUiStore } from '@/state/uiStore';
import { useSearchStore } from '@/state/searchStore';
import { useShortcutsStore } from '@/state/shortcutsStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import type { Platform } from '@/platform';
import { toggleFullscreen } from './fullscreen';
import { useOverviewStore } from '@/features/overview/overviewStore';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** The single-key shortcuts from §2.15 that M0's shell already has UI for. The rest (search,
 * add, undo/redo, zoom-to-*…) land with the features that back them. */
export function useGlobalShortcuts(platform: Platform) {
  const setTool = useUiStore((s) => s.setTool);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const toggleMinimap = useUiStore((s) => s.toggleMinimap);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // F11 works anywhere, even in a text field.
      if (e.key === 'F11') {
        e.preventDefault();
        void toggleFullscreen(platform);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
          e.preventDefault();
          setSettingsOpen(true);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          useSearchStore.getState().open();
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
        case 'o':
          useOverviewStore.getState().toggle();
          break;
        case 'm':
          toggleMinimap();
          break;
        case '/':
          e.preventDefault();
          useSearchStore.getState().open();
          break;
        case 'c':
          useConnectionsUiStore.getState().toggle();
          break;
        case '?':
          e.preventDefault();
          useShortcutsStore.getState().toggle();
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [platform, setTool, togglePanel, toggleMinimap, setSettingsOpen]);
}
