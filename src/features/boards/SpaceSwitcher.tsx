import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LayoutGrid, Map as MapIcon, Trash2 } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useBoardUiStore } from '@/state/boardUiStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useTrashUiStore } from '@/state/trashUiStore';
import { useHistoryStore } from '@/commands/history';
import { createCreateBoardCommand } from '@/commands/boardCommands';
import { useToastStore } from '@/state/toastStore';
import { switchSpace } from './switchSpace';
import { loadBoardSummaries, type BoardSummary } from './boardSummaries';
import { Menu } from '@/design/components';
import { en } from '@/i18n/en';
import type { MenuEntry } from '@/design/components/Menu';
import { useEscape } from '@/app/useEscape';
import { thumbUrl } from '@/lib/thumbs';
import { formatRelative } from '@/lib/relativeDate';

const RECENT_BOARDS_LIMIT = 5;
const MENU_WIDTH = 300;

/** A 36 px 2×2 cover made from the board's first four pictures. */
function BoardCover({ platform, ids }: { platform: Platform; ids: string[] }) {
  const items = useLibraryStore((s) => s.items);
  return (
    <span
      aria-hidden
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
        width: 36,
        height: 36,
        flex: 'none',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--surface-3)',
      }}
    >
      {[0, 1, 2, 3].map((i) => {
        const item = ids[i] ? items.get(ids[i]) : undefined;
        return item ? (
          <img
            key={i}
            src={thumbUrl(platform, item, 128)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span key={i} style={{ background: 'var(--surface-2)' }} />
        );
      })}
    </span>
  );
}

/** The menu itself, mounted only while open (so its name field and counts start fresh each time). Top-left space switcher (§2.1, §2.11, Patch 2 · C4): one panel with the Library, the five most
 * recently edited boards (with covers), a New board button that asks for a name, All boards… and
 * the Trash. Selecting a space calls `switchSpace`, which is what swaps the canvas's content. */
function SwitcherPanel({
  platform,
  libraryBoardId,
  anchor,
}: {
  platform: Platform;
  libraryBoardId: string;
  anchor: DOMRect;
}) {
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const [summaries, setSummaries] = useState<Map<string, BoardSummary>>(new Map());
  const [trashCount, setTrashCount] = useState(0);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  const liveBoards = useMemo(
    () =>
      [...boards.values()]
        .filter((b) => b.kind === 'board' && !b.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [boards],
  );

  // Reload the covers and counts each time the menu opens.
  useEffect(() => {
    void loadBoardSummaries(platform).then(setSummaries);
    void platform.db
      .select<{ n: number }>('SELECT COUNT(*) AS n FROM items WHERE deleted_at IS NOT NULL')
      .then((rows) => setTrashCount(Number(rows[0]?.n ?? 0)));
  }, [platform]);

  // Esc closes the menu, except in the name field, which keeps its own Esc (cancels the name).
  useEscape(true, () => useBoardUiStore.getState().closeSwitcher());

  function close(): void {
    useBoardUiStore.getState().closeSwitcher();
  }

  async function createBoard(): Promise<void> {
    const name = draft.trim();
    if (!name) return;
    const { command, board } = createCreateBoardCommand(platform, name);
    await useHistoryStore.getState().execute(command);
    close();
    await switchSpace(platform, board.id);
    useToastStore.getState().show(en.boards.createdBoard(board.name));
  }

  const libraryCount = summaries.get(libraryBoardId)?.count ?? 0;
  const entries: MenuEntry[] = [
    {
      id: 'library',
      label: en.spaceSwitcher.library,
      icon: <MapIcon size={18} strokeWidth={1.75} />,
      trailing: String(libraryCount),
      checked: currentBoardId === libraryBoardId,
      onSelect: () => {
        void switchSpace(platform, libraryBoardId);
        close();
      },
    },
    { kind: 'header', id: 'boards-header', label: en.spaceSwitcher.boards },
    ...liveBoards.slice(0, RECENT_BOARDS_LIMIT).map((b): MenuEntry => ({
      id: b.id,
      label: b.name,
      icon: <BoardCover platform={platform} ids={summaries.get(b.id)?.coverIds ?? []} />,
      secondary: en.spaceSwitcher.itemsEdited(
        summaries.get(b.id)?.count ?? 0,
        formatRelative(b.updatedAt),
      ),
      checked: currentBoardId === b.id,
      onSelect: () => {
        void switchSpace(platform, b.id);
        close();
      },
    })),
    {
      kind: 'custom',
      id: 'new-board',
      node: naming ? (
        <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
          <input
            autoFocus
            className="ds-chip-input__field"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
            }}
            placeholder={en.spaceSwitcher.newBoardPlaceholder}
            aria-label={en.spaceSwitcher.newBoard}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void createBoard();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setNaming(false);
                setDraft('');
              }
            }}
          />
          <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)', marginTop: 4 }}>
            {en.spaceSwitcher.newBoardHint}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ds-button ds-button--secondary"
          style={{
            width: 'calc(100% - 2 * var(--space-3))',
            margin: 'var(--space-2) var(--space-3)',
          }}
          onClick={() => setNaming(true)}
        >
          {en.spaceSwitcher.newBoard}
        </button>
      ),
    },
    {
      id: 'all-boards',
      label: en.spaceSwitcher.allBoards,
      icon: <LayoutGrid size={18} strokeWidth={1.75} />,
      trailing: String(liveBoards.length),
      onSelect: () => useBoardUiStore.getState().openGallery(),
    },
    { kind: 'separator', id: 'separator' },
    {
      id: 'trash',
      label: en.spaceSwitcher.trash,
      icon: <Trash2 size={18} strokeWidth={1.75} />,
      trailing: String(trashCount),
      onSelect: () => {
        close();
        useTrashUiStore.getState().show();
      },
    },
  ];

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 6 }} onClick={close} />
      <div
        style={{
          position: 'fixed',
          top: anchor.bottom + 8,
          left: anchor.left,
          width: MENU_WIDTH,
          zIndex: 7,
        }}
      >
        <Menu aria-label={en.spaceSwitcher.switchSpace} items={entries} />
      </div>
    </>,
    document.body,
  );
}

/** Top-left space switcher (§2.1, §2.11): the current space's name; opens the menu. */
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
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const currentName = useMemo(() => {
    const current = currentBoardId ? boards.get(currentBoardId) : null;
    return current && current.kind === 'board' ? current.name : en.spaceSwitcher.library;
  }, [boards, currentBoardId]);

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
        onClick={(e) => {
          setAnchor(e.currentTarget.getBoundingClientRect());
          useBoardUiStore.getState().toggleSwitcher();
        }}
      >
        <span className="font-display">{currentName}</span>
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
      {switcherOpen && anchor && (
        <SwitcherPanel platform={platform} libraryBoardId={libraryBoardId} anchor={anchor} />
      )}
    </span>
  );
}
