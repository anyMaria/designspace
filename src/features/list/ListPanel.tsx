import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  MousePointerSquareDashed,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { useLibraryStore } from '@/state/libraryStore';
import { useTermStore } from '@/state/termStore';
import { useBoardStore } from '@/state/boardStore';
import { useListStore, TILE_SIZE_PX, type TileSize } from '@/state/listStore';
import { useFocusStore } from '@/state/focusStore';
import { groupItems, sortItems, type GroupBy, type SortBy } from './listGrouping';
import { useSearchResults } from '@/features/search/useSearchResults';
import { LIST_ITEM_DRAG_MIME } from './useListDragToBoard';
import { IconButton, Tabs } from '@/design/components';
import { en } from '@/i18n/en';
import { prefersReducedMotion } from '@/lib/motion';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: en.list.groupNone },
  { value: 'type', label: en.list.groupType },
  { value: 'vibe', label: en.list.groupVibe },
  { value: 'movement', label: en.list.groupMovement },
  { value: 'tag', label: en.list.groupTag },
  { value: 'color', label: en.list.groupColor },
  { value: 'kind', label: en.list.groupKind },
  { value: 'artist', label: en.list.groupArtist },
  { value: 'month', label: en.list.groupMonth },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: en.list.sortNewest },
  { value: 'oldest', label: en.list.sortOldest },
  { value: 'title', label: en.list.sortTitle },
];

const TILE_SIZES: TileSize[] = ['S', 'M', 'L'];
const GAP = 8;
const HEADER_ROW_HEIGHT = 36;

interface HeaderRow {
  type: 'header';
  key: string;
  label: string;
  dotColor: string | null;
  count: number;
  itemIds: string[];
}
interface TileRow {
  type: 'tiles';
  key: string;
  itemIds: string[];
}
type Row = HeaderRow | TileRow;

/** The List panel (§2.9): grouping, sorting, tile size, a virtualized row list (groups flattened
 * into header rows + tile rows) so 10,000 items scroll smoothly, hover-to-highlight on the
 * canvas, click-to-select-and-fly, and double-click to Focus view. Works the same whether it's
 * docked in the right panel or shown "Expand"ed full-window — the caller just places it in a
 * differently sized container; this component only ever measures its own width. While a board is
 * open, a [This board | Library] switch (§2.11) scopes the list to the board's own placements or
 * the whole catalog; in "Library" mode, tiles are draggable onto the canvas to add a placement
 * (`useListDragToBoard`, mounted once in `Shell.tsx`). Still deferred: saved filters at the top
 * (M2-7 deferred those for the same reason — no such feature exists to surface yet). */
export function ListPanel({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const items = useLibraryStore((s) => s.items);
  const placements = useLibraryStore((s) => s.placements);
  const itemTerms = useTermStore((s) => s.itemTerms);
  const terms = useTermStore((s) => s.terms);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const groupBy = useListStore((s) => s.groupBy);
  const sortBy = useListStore((s) => s.sortBy);
  const tileSize = useListStore((s) => s.tileSize);
  const collapsedGroups = useListStore((s) => s.collapsedGroups);
  const expanded = useListStore((s) => s.expanded);
  const listSource = useListStore((s) => s.listSource);

  const isBoard = !!currentBoardId && boards.get(currentBoardId)?.kind === 'board';

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(288);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // "The List panel shows only the matches" (§2.8) while a search filter is active.
  const { matches } = useSearchResults(platform);
  const liveItems = useMemo(() => {
    const all = [...items.values()].filter((i) => !i.deletedAt);
    const scoped =
      isBoard && listSource === 'space' ? all.filter((i) => placements.has(i.id)) : all;
    return matches ? scoped.filter((i) => matches.has(i.id)) : scoped;
  }, [items, matches, isBoard, listSource, placements]);

  const groups = useMemo(
    () => groupItems(liveItems, groupBy, itemTerms, terms),
    [liveItems, groupBy, itemTerms, terms],
  );

  const px = TILE_SIZE_PX[tileSize];
  const columns = Math.max(1, Math.floor((width + GAP) / (px + GAP)));

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const group of groups) {
      const sortedIds = sortItems(group.itemIds, sortBy, items);
      if (groupBy !== 'none') {
        out.push({
          type: 'header',
          key: group.key,
          label: group.label,
          dotColor: group.dotColor,
          count: sortedIds.length,
          itemIds: sortedIds,
        });
      }
      if (groupBy === 'none' || !collapsedGroups.has(group.key)) {
        for (let i = 0; i < sortedIds.length; i += columns) {
          out.push({
            type: 'tiles',
            key: `${group.key}:${i}`,
            itemIds: sortedIds.slice(i, i + columns),
          });
        }
      }
    }
    return out;
  }, [groups, sortBy, items, groupBy, collapsedGroups, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'header' ? HEADER_ROW_HEIGHT : px + GAP),
    overscan: 8,
  });

  // Single click selects+flies (switching the panel to Details, per §2.9 — which unmounts this
  // tile), but a double-click's second click needs the same tile still in the DOM to register at
  // all. Delaying the single-click side effect and letting dblclick cancel it is the standard fix
  // — without it, the panel switches away after the *first* click of a double-click and the
  // second click lands on nothing, so Focus view could never open from here.
  const clickTimer = useRef<number | null>(null);

  function handleTileClick(id: string): void {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      useLibraryStore.getState().setSelection([id]);
      engine?.zoomToIds([id], prefersReducedMotion());
      clickTimer.current = null;
    }, 220);
  }

  function handleTileDoubleClick(id: string): void {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    useFocusStore.getState().open(id);
  }

  function selectGroup(itemIds: string[]): void {
    useLibraryStore.getState().setSelection(itemIds);
  }

  // A wholly empty *library* needs no controls — there's nothing to group/sort/switch. An empty
  // *board* (in "This board" mode) still needs the [This board | Library] toggle rendered below,
  // or the owner would have no way to switch to "Library" and drag something in.
  if (liveItems.length === 0 && !isBoard) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-3)' }}>{en.list.empty}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        flex: 1,
        minHeight: 0,
      }}
    >
      {isBoard && (
        <Tabs
          aria-label={en.list.source}
          value={listSource}
          onChange={(v) => useListStore.getState().setListSource(v)}
          tabs={[
            { id: 'space', label: en.list.sourceThisBoard },
            { id: 'library', label: en.list.sourceLibrary },
          ]}
        />
      )}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {en.list.groupBy}
          <select
            value={groupBy}
            onChange={(e) => useListStore.getState().setGroupBy(e.target.value as GroupBy)}
            style={selectStyle}
          >
            {GROUP_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {en.list.sortBy}
          <select
            value={sortBy}
            onChange={(e) => useListStore.getState().setSortBy(e.target.value as SortBy)}
            style={selectStyle}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {TILE_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className="ds-chip"
              style={
                tileSize === s
                  ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                  : undefined
              }
              onClick={() => useListStore.getState().setTileSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <IconButton
          icon={
            expanded ? (
              <Minimize2 size={16} strokeWidth={1.75} />
            ) : (
              <Maximize2 size={16} strokeWidth={1.75} />
            )
          }
          label={expanded ? en.list.collapse : en.list.expand}
          onClick={() => useListStore.getState().setExpanded(!expanded)}
        />
      </div>

      {liveItems.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-3)' }}>{en.list.empty}</p>
        </div>
      ) : (
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.type === 'header' ? (
                    <GroupHeader row={row} engine={engine} onSelectGroup={selectGroup} />
                  ) : (
                    <div style={{ display: 'flex', gap: GAP, paddingBottom: GAP }}>
                      {row.itemIds.map((id) => (
                        <Tile
                          key={id}
                          id={id}
                          px={px}
                          platform={platform}
                          draggable={isBoard}
                          onClick={() => handleTileClick(id)}
                          onDoubleClick={() => handleTileDoubleClick(id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: 'var(--surface-1)',
  color: 'var(--text-1)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
};

function GroupHeader({
  row,
  engine,
  onSelectGroup,
}: {
  row: HeaderRow;
  engine: Engine | null;
  onSelectGroup: (ids: string[]) => void;
}) {
  const collapsed = useListStore((s) => s.collapsedGroups.has(row.key));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        height: HEADER_ROW_HEIGHT,
        cursor: 'pointer',
      }}
      onMouseEnter={() => engine?.setHoverHighlight(new Set(row.itemIds))}
      onMouseLeave={() => engine?.setHoverHighlight(null)}
      onClick={() => useListStore.getState().toggleGroupCollapsed(row.key)}
    >
      {collapsed ? (
        <ChevronRight size={14} strokeWidth={1.75} />
      ) : (
        <ChevronDown size={14} strokeWidth={1.75} />
      )}
      {row.dotColor && (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: row.dotColor,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ fontWeight: 600 }}>{row.label}</span>
      <span style={{ color: 'var(--text-3)' }}>{row.count}</span>
      <button
        type="button"
        aria-label={en.list.selectGroup}
        title={en.list.selectGroup}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-2)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectGroup(row.itemIds);
        }}
      >
        <MousePointerSquareDashed size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function Tile({
  id,
  px,
  platform,
  draggable,
  onClick,
  onDoubleClick,
}: {
  id: string;
  px: number;
  platform: Platform;
  draggable: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const item = useLibraryStore((s) => s.items.get(id));
  if (!item) return null;
  return (
    <button
      type="button"
      className="ds-list-tile"
      title={item.title}
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData(LIST_ITEM_DRAG_MIME, id) : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        width: px,
        height: px,
        flexShrink: 0,
        border: 'none',
        padding: 0,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--surface-2)',
      }}
    >
      {item.status === 'ok' && (
        <img
          src={platform.cache.url(`t128/${id}`)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </button>
  );
}
