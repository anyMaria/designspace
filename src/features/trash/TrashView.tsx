import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button, EmptyState, IconButton } from '@/design/components';
import { useBoardStore } from '@/state/boardStore';
import { useTrashUiStore } from '@/state/trashUiStore';
import { useHistoryStore } from '@/commands/history';
import { createRestoreItemCommand } from '@/commands/itemCommands';
import { createRestoreBoardCommand } from '@/commands/boardCommands';
import { useEscape } from '@/app/useEscape';
import { thumbUrl } from '@/lib/thumbs';
import { formatRelative } from '@/lib/relativeDate';
import { useToastStore } from '@/state/toastStore';
import { deleteForever, listTrashedItems } from './trashActions';
import { en } from '@/i18n/en';

const TILE_PX = 148;

/** The Trash screen (Patch 2 · C5): a full-window view of everything deleted, with Restore and
 * Delete forever. Opened from the Library menu or the "Open Trash" toast. */
export function TrashView({ platform }: { platform: Platform }) {
  const open = useTrashUiStore((s) => s.open);
  useEscape(open, () => useTrashUiStore.getState().hide(), { allowWhileTyping: true });
  if (!open) return null;
  return <TrashContent platform={platform} />;
}

function TrashContent({ platform }: { platform: Platform }) {
  const boards = useBoardStore((s) => s.boards);
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newestFirst, setNewestFirst] = useState(true);

  const refresh = useCallback(async () => {
    setItems(await listTrashedItems(platform));
  }, [platform]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not a sync setState loop
    void refresh();
  }, [refresh]);

  const trashedBoards = useMemo(
    () =>
      [...boards.values()]
        .filter((b) => b.kind === 'board' && b.deletedAt)
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [boards],
  );

  const sorted = useMemo(() => {
    const list = [...(items ?? [])];
    list.sort((a, b) => (a.deletedAt ?? '').localeCompare(b.deletedAt ?? ''));
    return newestFirst ? list.reverse() : list;
  }, [items, newestFirst]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function restore(ids: string[]): Promise<void> {
    const boardId = useBoardStore.getState().currentBoardId;
    for (const id of ids) {
      await useHistoryStore.getState().execute(createRestoreItemCommand(platform, id, boardId));
    }
    setSelected(new Set());
    await refresh();
  }

  async function removeForever(ids: string[]): Promise<void> {
    await deleteForever(platform, ids);
    setSelected(new Set());
    await refresh();
  }

  const all = items ?? [];
  const chosen = [...selected].filter((id) => all.some((i) => i.id === id));
  const allSelected = all.length > 0 && chosen.length === all.length;

  return (
    <div
      data-testid="trash-view"
      role="dialog"
      aria-label={en.trash.title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'var(--canvas)',
        padding: 'var(--space-6)',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <h1 className="font-display" style={{ fontSize: 'var(--text-xl)', margin: 0 }}>
          {en.trash.title}
        </h1>
        <span style={{ color: 'var(--text-2)' }}>
          {en.trash.counts(all.length, trashedBoards.length)}
        </span>
        <span style={{ flex: 1 }} />
        {all.length > 0 && (
          <Button
            variant="ghost"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (window.confirm(en.trash.emptyNowConfirm(all.length)))
                void removeForever(all.map((i) => i.id));
            }}
          >
            {en.trash.emptyTrash}
          </Button>
        )}
        <IconButton
          icon={<X size={20} strokeWidth={1.75} />}
          label={en.boards.close}
          onClick={() => useTrashUiStore.getState().hide()}
        />
      </div>

      <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', maxWidth: 640 }}>
        {en.trash.help}
      </p>

      {items !== null && all.length === 0 && trashedBoards.length === 0 && (
        <EmptyState title={en.trash.empty} />
      )}

      {all.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              margin: 'var(--space-4) 0',
            }}
          >
            <input
              type="checkbox"
              aria-label={en.trash.selectAll}
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(all.map((i) => i.id)))}
            />
            <span style={{ color: 'var(--text-2)' }}>{en.trash.selected(chosen.length)}</span>
            <Button
              variant="secondary"
              disabled={chosen.length === 0}
              onClick={() => void restore(chosen)}
            >
              {en.trash.restore}
            </Button>
            <Button
              variant="secondary"
              disabled={chosen.length === 0}
              onClick={() => {
                if (window.confirm(en.trash.emptyNowConfirm(chosen.length)))
                  void removeForever(chosen);
              }}
            >
              {en.trash.deleteForever}
            </Button>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setNewestFirst((v) => !v)}>
              {newestFirst ? en.trash.newestFirst : en.trash.oldestFirst}
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_PX}px, 1fr))`,
              gap: 'var(--space-4)',
            }}
          >
            {sorted.map((item) => (
              <TrashTile
                key={item.id}
                platform={platform}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onRestore={() => void restore([item.id])}
                onDelete={() => {
                  if (window.confirm(en.trash.deleteForeverConfirm)) void removeForever([item.id]);
                }}
              />
            ))}
          </div>
        </>
      )}

      {trashedBoards.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2
            className="font-display"
            style={{ fontSize: 'var(--text-md)', color: 'var(--text-2)' }}
          >
            {en.trash.boardsHeading}
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
                  onClick={() => {
                    void useHistoryStore
                      .getState()
                      .execute(createRestoreBoardCommand(platform, board.id))
                      .then(() =>
                        useToastStore.getState().show(en.boards.restoredBoard(board.name)),
                      );
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrashTile({
  platform,
  item,
  selected,
  onToggle,
  onRestore,
  onDelete,
}: {
  platform: Platform;
  item: Item;
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const hasThumb =
    item.status === 'ok' && ['image', 'video', 'pdf', 'font', 'link'].includes(item.kind);
  return (
    <div
      data-testid="trash-tile"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggle}
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        outline: selected ? '2px solid var(--accent)' : 'none',
        outlineOffset: 2,
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'var(--surface-2)',
        }}
      >
        {hasThumb && (
          <img
            src={thumbUrl(platform, item, 128)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <input
        type="checkbox"
        aria-label={item.title || item.fileName || item.kind}
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 8, left: 8 }}
      />
      {hover && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
          <IconButton
            icon={<RotateCcw size={16} strokeWidth={1.75} />}
            label={en.trash.restore}
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
          />
          <IconButton
            icon={<Trash2 size={16} strokeWidth={1.75} />}
            label={en.trash.deleteForever}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          />
        </div>
      )}
      <div
        style={{
          marginTop: 6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 'var(--text-sm)',
        }}
      >
        {item.title || item.fileName || item.kind}
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)' }}>
        {en.trash.deletedWhen(item.deletedAt ? formatRelative(item.deletedAt) : '')}
      </div>
    </div>
  );
}
