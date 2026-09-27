import { useMemo, useState } from 'react';
import { X, Pencil, Copy, Trash2, RotateCcw, Check } from 'lucide-react';
import type { Platform } from '@/platform/types';
import { useBoardStore } from '@/state/boardStore';
import { useBoardUiStore } from '@/state/boardUiStore';
import { useHistoryStore } from '@/commands/history';
import {
  createCreateBoardCommand,
  createRenameBoardCommand,
  createDuplicateBoardCommand,
  createDeleteBoardCommand,
  createRestoreBoardCommand,
} from '@/commands/boardCommands';
import { useToastStore } from '@/state/toastStore';
import { IconButton, Button, EmptyState } from '@/design/components';
import type { Board } from '@/state/types';
import { en } from '@/i18n/en';

/** The Boards gallery (§2.11): "All boards…" from the space switcher. Covers are a placeholder
 * tile (no thumbnail-compositing exists yet — real covers need the board canvas's own item
 * placements, a later M4 sub-task) showing the board's initial and name; rename is inline,
 * duplicate and delete/restore are icon actions per card. Deleted boards move to a collapsed
 * Trash section rather than disappearing, mirroring items' own Trash (§2.16). */
export function BoardsGallery({ platform }: { platform: Platform }) {
  const galleryOpen = useBoardUiStore((s) => s.galleryOpen);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const activeBoards = useMemo(
    () =>
      [...boards.values()]
        .filter((b) => b.kind === 'board' && !b.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [boards],
  );
  const trashedBoards = useMemo(
    () =>
      [...boards.values()]
        .filter((b) => b.kind === 'board' && b.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [boards],
  );

  if (!galleryOpen) return null;

  async function handleCreate(): Promise<void> {
    const { command, board } = createCreateBoardCommand(platform, en.boards.untitled);
    await useHistoryStore.getState().execute(command);
    useBoardStore.getState().setCurrentBoardId(board.id);
    setRenamingId(board.id);
    setDraftName(board.name);
  }

  function startRename(board: Board): void {
    setRenamingId(board.id);
    setDraftName(board.name);
  }

  async function commitRename(): Promise<void> {
    if (!renamingId) return;
    const name = draftName.trim();
    setRenamingId(null);
    if (!name) return;
    await useHistoryStore.getState().execute(createRenameBoardCommand(platform, renamingId, name));
  }

  async function handleDuplicate(board: Board): Promise<void> {
    const { command, board: copy } = createDuplicateBoardCommand(
      platform,
      board.id,
      en.boards.copySuffix(board.name),
    );
    await useHistoryStore.getState().execute(command);
    useToastStore.getState().show(en.boards.duplicatedBoard(copy.name));
  }

  async function handleDelete(board: Board): Promise<void> {
    await useHistoryStore.getState().execute(createDeleteBoardCommand(platform, board.id));
    useToastStore.getState().show(en.boards.deletedBoard(board.name), {
      actionLabel: en.boards.restore,
      onAction: () => void useHistoryStore.getState().undo(),
    });
  }

  async function handleRestore(board: Board): Promise<void> {
    await useHistoryStore.getState().execute(createRestoreBoardCommand(platform, board.id));
    useToastStore.getState().show(en.boards.restoredBoard(board.name));
  }

  function openBoard(board: Board): void {
    useBoardStore.getState().setCurrentBoardId(board.id);
    useBoardUiStore.getState().closeGallery();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'var(--canvas)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-6)',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h1 className="font-display" style={{ fontSize: 'var(--text-xl)', margin: 0 }}>
          {en.boards.gallery}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="primary" onClick={() => void handleCreate()}>
            {en.spaceSwitcher.newBoard}
          </Button>
          <IconButton
            icon={<X size={20} strokeWidth={1.75} />}
            label={en.boards.close}
            onClick={() => useBoardUiStore.getState().closeGallery()}
          />
        </div>
      </div>

      {activeBoards.length === 0 ? (
        <EmptyState title={en.boards.empty} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {activeBoards.map((board) => (
            <div
              key={board.id}
              className="ds-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: board.id === currentBoardId ? '2px solid var(--accent)' : undefined,
              }}
            >
              <button
                type="button"
                onClick={() => openBoard(board)}
                aria-label={en.boards.open}
                style={{
                  aspectRatio: '4 / 3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xl)',
                  color: 'var(--text-2)',
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {board.name.trim().charAt(0).toUpperCase() || '?'}
              </button>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                }}
              >
                {renamingId === board.id ? (
                  <>
                    <input
                      autoFocus
                      className="ds-chip-input__field"
                      value={draftName}
                      aria-label={en.boards.namePlaceholder}
                      placeholder={en.boards.namePlaceholder}
                      style={{ flex: 1, minWidth: 0 }}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                    />
                    <IconButton
                      icon={<Check size={16} strokeWidth={1.75} />}
                      label={en.boards.rename}
                      onClick={() => void commitRename()}
                    />
                  </>
                ) : (
                  <>
                    <span
                      style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {board.name}
                    </span>
                    <IconButton
                      icon={<Pencil size={16} strokeWidth={1.75} />}
                      label={en.boards.rename}
                      onClick={() => startRename(board)}
                    />
                    <IconButton
                      icon={<Copy size={16} strokeWidth={1.75} />}
                      label={en.boards.duplicate}
                      onClick={() => void handleDuplicate(board)}
                    />
                    <IconButton
                      icon={<Trash2 size={16} strokeWidth={1.75} />}
                      label={en.boards.delete}
                      onClick={() => void handleDelete(board)}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {trashedBoards.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'var(--text-md)', color: 'var(--text-2)' }}
          >
            {en.boards.trash}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {trashedBoards.map((board) => (
              <div
                key={board.id}
                className="ds-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-3)',
                  opacity: 0.7,
                }}
              >
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {board.name}
                </span>
                <IconButton
                  icon={<RotateCcw size={16} strokeWidth={1.75} />}
                  label={en.boards.restore}
                  onClick={() => void handleRestore(board)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
