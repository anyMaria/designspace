import { useShortcutsStore } from '@/state/shortcutsStore';
import { Dialog, Kbd } from '@/design/components';
import { en } from '@/i18n/en';

interface ShortcutRow {
  action: string;
  keys: string[];
}

/** §2.15's table, restricted to shortcuts the app actually has wired up right now — Boards,
 * notes, links and the Frame tool don't exist before M4–M5, so their entries (Ctrl+O/N, F,
 * Shift+Delete) are left out rather than documented as dead keys, matching the same call
 * `ContextMenu.tsx` makes for its own deferred actions. Shift+C (Constellations) is left out
 * too, since the layout it toggles doesn't exist until M3-6/M3-7. */
const ROWS: ShortcutRow[] = [
  { action: en.shortcuts.search, keys: ['Ctrl', 'K'] },
  { action: '', keys: ['/'] },
  { action: en.shortcuts.undo, keys: ['Ctrl', 'Z'] },
  { action: en.shortcuts.redo, keys: ['Ctrl', 'Shift', 'Z'] },
  { action: en.shortcuts.selectTool, keys: ['V'] },
  { action: en.shortcuts.handTool, keys: ['H'] },
  { action: en.shortcuts.selectAll, keys: ['Ctrl', 'A'] },
  { action: en.shortcuts.moveToTrash, keys: ['Delete'] },
  { action: en.shortcuts.focusView, keys: ['Enter'] },
  { action: en.shortcuts.closeDeselect, keys: ['Esc'] },
  { action: en.shortcuts.zoomToFit, keys: ['Shift', '1'] },
  { action: en.shortcuts.zoomToSelection, keys: ['Shift', '2'] },
  { action: en.shortcuts.zoomTo100, keys: ['Shift', '0'] },
  { action: en.shortcuts.zoomIn, keys: ['Ctrl', '='] },
  { action: en.shortcuts.zoomOut, keys: ['Ctrl', '−'] },
  { action: en.shortcuts.panelToggle, keys: ['L'] },
  { action: en.shortcuts.minimapToggle, keys: ['M'] },
  { action: en.shortcuts.favorite, keys: ['S'] },
  { action: en.shortcuts.rediscover, keys: ['R'] },
  { action: en.shortcuts.inboxTriage, keys: ['I'] },
  { action: en.shortcuts.connections, keys: ['C'] },
  { action: en.shortcuts.stackFront, keys: [']'] },
  { action: en.shortcuts.stackBack, keys: ['['] },
  { action: en.shortcuts.nudge, keys: ['↑↓←→'] },
  { action: en.shortcuts.settings, keys: ['Ctrl', ','] },
  { action: en.shortcuts.shortcutList, keys: ['?'] },
];

export function ShortcutListOverlay() {
  const isOpen = useShortcutsStore((s) => s.isOpen);
  if (!isOpen) return null;

  return (
    <Dialog title={en.shortcuts.title} onClose={() => useShortcutsStore.getState().close()}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          maxHeight: '60vh',
          overflowY: 'auto',
        }}
      >
        {ROWS.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
            }}
          >
            <span style={{ color: row.action ? 'var(--text-1)' : 'var(--text-3)' }}>
              {row.action || en.shortcuts.orLabel}
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              {row.keys.map((k, j) => (
                <Kbd key={j}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
