import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { useLibraryStore } from '@/state/libraryStore';
import { useBoardStore } from '@/state/boardStore';
import { switchSpace } from '@/features/boards/switchSpace';
import { prefersReducedMotion } from '@/lib/motion';
import { en } from '@/i18n/en';
import type { ActionEntry } from '@/lib/actions';
import { useActions } from './useActions';

/** The right panel's "Actions" tab (Patch 1 · D4): every #hashtag written in notes (and, from
 * Phase E, descriptions), grouped by tag. Click a row to go to the item; hover to highlight it. */
export function ActionsPanel({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const { groups } = useActions();
  const items = useLibraryStore((s) => s.items);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // A hover highlight must never outlive this panel (a tab switch unmounts it mid-hover).
  useEffect(() => () => engine?.setHoverHighlight(null), [engine]);

  async function go(entry: ActionEntry): Promise<void> {
    const item = items.get(entry.itemId);
    if (!item) return;
    const lib = useLibraryStore.getState();
    if (!lib.placements.has(entry.itemId)) {
      const target = item.originBoardId ?? lib.libraryBoardId;
      if (target) await switchSpace(platform, target);
    }
    useLibraryStore.getState().setSelection([entry.itemId]);
    engine?.setSelection([entry.itemId]);
    engine?.zoomToIds([entry.itemId], prefersReducedMotion());
  }

  function where(entry: ActionEntry): string {
    const item = items.get(entry.itemId);
    const base =
      entry.source === 'note' ? en.actions.note : item?.title.trim() || en.actions.description;
    const boardId = item?.originBoardId;
    const boardName = boardId && boardId !== currentBoardId ? boards.get(boardId)?.name : null;
    return boardName ? `${base} · ${boardName}` : base;
  }

  if (groups.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-3)', textAlign: 'center' }}>{en.actions.empty}</p>
      </div>
    );
  }

  return (
    <div
      onScroll={() => engine?.setHoverHighlight(null)}
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.tag);
        return (
          <section key={group.tag}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.tag)) next.delete(group.tag);
                  else next.add(group.tag);
                  return next;
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                width: '100%',
                fontWeight: 700,
                color: 'var(--text-1)',
                padding: 'var(--space-1) 0',
              }}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}#{group.tag} (
              {group.entries.length})
            </button>
            {!isCollapsed &&
              group.entries.map((entry, i) => (
                <button
                  key={`${entry.itemId}-${i}`}
                  type="button"
                  onClick={() => void go(entry)}
                  onMouseEnter={() => engine?.setHoverHighlight(new Set([entry.itemId]))}
                  onMouseLeave={() => engine?.setHoverHighlight(null)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    alignItems: 'flex-start',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  className="ds-menu__item"
                >
                  <span
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      color: 'var(--text-1)',
                    }}
                  >
                    {entry.line}
                  </span>
                  <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                    {where(entry)}
                  </span>
                </button>
              ))}
          </section>
        );
      })}
    </div>
  );
}
