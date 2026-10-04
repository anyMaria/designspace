import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useBoardUiStore } from '@/state/boardUiStore';
import { useHistoryStore } from '@/commands/history';
import { createCreateBoardCommand } from '@/commands/boardCommands';
import { useToastStore } from '@/state/toastStore';
import { switchSpace } from './switchSpace';
import { Popover, Menu } from '@/design/components';
import { en } from '@/i18n/en';
import type { MenuItem } from '@/design/components/Menu';
import { useEscape } from '@/app/useEscape';

const RECENT_BOARDS_LIMIT = 5;

/** Top-left space switcher (§2.1, §2.11): current space's name, a dropdown of the Library plus
 * the most recently updated boards, "+ New board", and "All boards…" to open the gallery.
 * Selecting a space calls `switchSpace`, which is what actually swaps the canvas's content. */
export function SpaceSwitcher({
  platform,
  libraryBoardId,
}: {
  platform: Platform;
  libraryBoardId: string;
}) {
  const switcherOpen = useBoardUiStore((s) => s.switcherOpen);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);

  const currentName = useMemo(() => {
    const current = currentBoardId ? boards.get(currentBoardId) : null;
    return current && current.kind === 'board' ? current.name : en.spaceSwitcher.library;
  }, [boards, currentBoardId]);

  const recentBoards = useMemo(
    () =>
      [...boards.values()]
        .filter((b) => b.kind === 'board' && !b.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_BOARDS_LIMIT),
    [boards],
  );

  useEscape(switcherOpen, () => useBoardUiStore.getState().closeSwitcher(), {
    allowWhileTyping: true,
  });

  async function handleNewBoard(): Promise<void> {
    const { command, board } = createCreateBoardCommand(platform, en.boards.untitled);
    await useHistoryStore.getState().execute(command);
    useBoardUiStore.getState().closeSwitcher();
    await switchSpace(platform, board.id);
    useToastStore.getState().show(en.boards.createdBoard(board.name));
  }

  const items: MenuItem[] = [
    {
      id: 'library',
      label: en.spaceSwitcher.library,
      onSelect: () => {
        void switchSpace(platform, libraryBoardId);
        useBoardUiStore.getState().closeSwitcher();
      },
    },
    ...recentBoards.map((b) => ({
      id: b.id,
      label: b.name,
      onSelect: () => {
        void switchSpace(platform, b.id);
        useBoardUiStore.getState().closeSwitcher();
      },
    })),
    {
      id: 'new-board',
      label: en.spaceSwitcher.newBoard,
      onSelect: () => void handleNewBoard(),
    },
    {
      id: 'all-boards',
      label: en.spaceSwitcher.allBoards,
      onSelect: () => useBoardUiStore.getState().openGallery(),
    },
  ];

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        className="ds-panel"
        aria-label={en.spaceSwitcher.switchSpace}
        aria-expanded={switcherOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
        }}
        onClick={() => useBoardUiStore.getState().toggleSwitcher()}
      >
        <span className="font-display">{currentName}</span>
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
      {switcherOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 2 }}
            onClick={() => useBoardUiStore.getState().closeSwitcher()}
          />
          <div
            style={{ position: 'absolute', top: 'calc(100% + var(--space-2))', left: 0, zIndex: 3 }}
          >
            <Popover style={{ padding: 0, width: 220 }}>
              <Menu aria-label={en.spaceSwitcher.switchSpace} items={items} />
            </Popover>
          </div>
        </>
      )}
    </span>
  );
}
