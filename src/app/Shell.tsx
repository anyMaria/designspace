import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Share2,
  MousePointer2,
  Hand,
  Settings as SettingsIcon,
  PanelRight,
} from 'lucide-react';
import type { Platform, LibraryInfo } from '@/platform';
import { useUiStore } from '@/state/uiStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { useUndoRedoShortcuts } from '@/commands/useUndoRedoShortcuts';
import { CanvasView } from '@/canvas/CanvasView';
import type { Engine } from '@/canvas/Engine';
import { useEngineBindings } from '@/canvas/useEngineBindings';
import { useCanvasShortcuts } from '@/canvas/useCanvasShortcuts';
import { useContextMenu } from '@/canvas/useContextMenu';
import { ContextMenu } from '@/canvas/ContextMenu';
import { ZoomMenu } from '@/canvas/ZoomMenu';
import { Minimap } from '@/canvas/Minimap';
import { useFocusViewBinding } from '@/canvas/useFocusViewBinding';
import { FocusView } from '@/features/focus/FocusView';
import { useDropAndPaste } from '@/features/import/useDropAndPaste';
import { AddMenu } from '@/features/import/AddMenu';
import { DropOverlay } from '@/features/import/DropOverlay';
import { ImportProgressCard } from '@/features/import/ImportProgressCard';
import { ToastHost } from '@/features/toasts/ToastHost';
import { useAddMenuStore } from '@/state/addMenuStore';
import { DetailsPanel } from '@/features/details/DetailsPanel';
import { BulkDetailsPanel } from '@/features/details/BulkDetailsPanel';
import { TriageView } from '@/features/triage/TriageView';
import { openInboxTriage } from '@/features/triage/openInboxTriage';
import { triggerRediscover } from '@/features/rediscover/triggerRediscover';
import { ShortcutListOverlay } from '@/features/shortcuts/ShortcutListOverlay';
import { SearchBar } from '@/features/search/SearchBar';
import { useSearchBinding } from '@/canvas/useSearchBinding';
import { useConnectionsBinding } from '@/canvas/useConnectionsBinding';
import { useManualConnectionsBinding } from '@/canvas/useManualConnectionsBinding';
import { ConnectionTooltip } from '@/features/connections/ConnectionTooltip';
import { ConnectionsPopover } from '@/features/connections/ConnectionsPopover';
import { ConnectionLabelDialog } from '@/features/connections/ConnectionLabelDialog';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { useSearchStore, isFilterActive } from '@/state/searchStore';
import { ListPanel } from '@/features/list/ListPanel';
import { useListStore } from '@/state/listStore';
import {
  Dock,
  DockDivider,
  IconButton,
  Panel,
  Tabs,
  EmptyState,
  Button,
} from '@/design/components';
import { en } from '@/i18n/en';
import { SettingsDialog } from '@/features/settings/SettingsDialog';

export interface ShellProps {
  platform: Platform;
  library: LibraryInfo;
  libraryBoardId: string;
  benchCount: number | null;
}

export function Shell({ platform, library, libraryBoardId, benchCount }: ShellProps) {
  useGlobalShortcuts();
  useUndoRedoShortcuts();
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const wheelMode = useUiStore((s) => s.wheelMode);
  const panelOpen = useUiStore((s) => s.panelOpen);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const panelTab = useUiStore((s) => s.panelTab);
  const setPanelTab = useUiStore((s) => s.setPanelTab);
  const minimapOpen = useUiStore((s) => s.minimapOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [engine, setEngine] = useState<Engine | null>(null);
  const itemCount = useLibraryStore((s) => s.items.size);
  const selection = useLibraryStore((s) => s.selection);
  const items = useLibraryStore((s) => s.items);
  const selectedItem = selection.size === 1 ? (items.get([...selection][0]) ?? null) : null;
  const selectedItems = useMemo(
    () => (selection.size > 1 ? [...selection].map((id) => items.get(id)).filter((i) => !!i) : []),
    [selection, items],
  );
  const inboxCount = useMemo(
    () => [...items.values()].filter((i) => !i.deletedAt && !i.sortedAt).length,
    [items],
  );

  useEffect(() => {
    useLibraryStore.getState().setLibraryBoardId(libraryBoardId);
  }, [libraryBoardId]);

  // Selecting an item switches the panel to Details — §2.9 ("Click → select on the canvas...
  // the panel switches to Details"), extended here to canvas selection generally since the List
  // panel's own click-to-select doesn't exist until it does (M2-8).
  useEffect(() => {
    if (selection.size >= 1) setPanelTab('details');
  }, [selection, setPanelTab]);

  useEngineBindings(engine, platform);
  useCanvasShortcuts(engine, platform);
  const { dragOver } = useDropAndPaste(engine, platform);
  const { menu: contextMenu, close: closeContextMenu } = useContextMenu(engine);
  useFocusViewBinding(engine);
  useSearchBinding(engine);
  useConnectionsBinding(engine);
  useManualConnectionsBinding(engine, platform);
  const searchFilterActive = useSearchStore((s) => isFilterActive(s.filter));
  const listExpanded = useListStore((s) => s.expanded);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <CanvasView
        tool={tool}
        wheelMode={wheelMode}
        benchCount={benchCount}
        onEngineReady={setEngine}
      />

      {/* Library map empty state — §2.14 */}
      {itemCount === 0 && !benchCount && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <EmptyState
              title={en.emptyStates.libraryMap}
              action={
                <Button variant="primary" onClick={() => useAddMenuStore.getState().setOpen(true)}>
                  + Add
                </Button>
              }
            />
          </div>
        </div>
      )}

      {/* Top-left: space switcher, Inbox chip, Rediscover — §2.1 */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-4)',
          left: 'var(--space-4)',
          zIndex: 1,
          display: 'flex',
          gap: 'var(--space-2)',
        }}
      >
        <Panel
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          <span className="font-display">{en.spaceSwitcher.library}</span>
        </Panel>
        {inboxCount > 0 && (
          <button
            type="button"
            className="ds-panel"
            style={{
              padding: 'var(--space-2) var(--space-4)',
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
            }}
            onClick={openInboxTriage}
          >
            {en.inbox.chip(inboxCount)}
          </button>
        )}
        <IconButton
          icon={<Share2 size={20} strokeWidth={1.75} />}
          label={en.rediscover}
          onClick={() => triggerRediscover(engine)}
        />
      </div>

      {/* Top-right: Settings, Panel toggle — §2.1 */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-4)',
          right: 'var(--space-4)',
          zIndex: 1,
          display: 'flex',
          gap: 'var(--space-2)',
        }}
      >
        <IconButton
          icon={<SettingsIcon size={20} strokeWidth={1.75} />}
          label={en.settings.title}
          onClick={() => setSettingsOpen(true)}
        />
        <IconButton
          icon={<PanelRight size={20} strokeWidth={1.75} />}
          label={en.panel.list}
          active={panelOpen}
          onClick={togglePanel}
        />
      </div>

      {/* Bottom-center dock — §2.1 */}
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--space-4)',
          left: '50%',
          zIndex: 1,
          transform: 'translateX(-50%)',
        }}
      >
        <Dock>
          <AddMenu platform={platform} engine={engine} />
          <span style={{ position: 'relative' }}>
            <IconButton
              icon={<Search size={20} strokeWidth={1.75} />}
              label={en.dock.search}
              onClick={() => useSearchStore.getState().open()}
            />
            {searchFilterActive && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </span>
          <span style={{ position: 'relative' }}>
            <IconButton
              icon={<Share2 size={20} strokeWidth={1.75} />}
              label={en.dock.connections}
              active={useConnectionsUiStore((s) => s.isOpen)}
              onClick={() => useConnectionsUiStore.getState().toggle()}
            />
            <ConnectionsPopover />
          </span>
          <DockDivider />
          <IconButton
            icon={<MousePointer2 size={20} strokeWidth={1.75} />}
            label={en.dock.selectTool}
            active={tool === 'select'}
            onClick={() => setTool('select')}
          />
          <IconButton
            icon={<Hand size={20} strokeWidth={1.75} />}
            label={en.dock.handTool}
            active={tool === 'hand'}
            onClick={() => setTool('hand')}
          />
          <DockDivider />
          <ZoomMenu engine={engine} />
        </Dock>
      </div>

      {/* Bottom-left: minimap — §2.1 */}
      {minimapOpen && (
        <Panel
          style={{
            position: 'absolute',
            bottom: 'var(--space-4)',
            left: 'var(--space-4)',
            zIndex: 1,
            padding: 0,
          }}
        >
          <Minimap engine={engine} />
        </Panel>
      )}

      {/* Right panel — §2.1, §2.6, §2.9 (content lands in M2) */}
      {panelOpen && (
        <Panel
          style={{
            position: 'absolute',
            top: 'calc(var(--space-4) + var(--hit-target-min) + var(--space-2))',
            right: 'var(--space-4)',
            bottom: 'var(--space-4)',
            zIndex: 1,
            width: 320,
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-4)',
            gap: 'var(--space-4)',
          }}
        >
          <Tabs
            aria-label="Panel"
            tabs={[
              { id: 'list', label: en.panel.list },
              { id: 'details', label: en.panel.details },
            ]}
            value={panelTab}
            onChange={setPanelTab}
          />
          {panelTab === 'list' ? (
            listExpanded ? (
              <div
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <p style={{ color: 'var(--text-3)', textAlign: 'center' }}>{en.list.expand}…</p>
              </div>
            ) : (
              <ListPanel platform={platform} engine={engine} />
            )
          ) : selectedItems.length > 1 ? (
            <BulkDetailsPanel platform={platform} items={selectedItems} />
          ) : selectedItem ? (
            <DetailsPanel platform={platform} item={selectedItem} />
          ) : (
            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <p style={{ color: 'var(--text-3)', textAlign: 'center' }}>{en.details.empty}</p>
            </div>
          )}
        </Panel>
      )}

      {/* "Expand" — a full-window gallery, independent of the docked panel's own open state
          (§2.9) — uses the same <ListPanel>, which only ever measures its own container. */}
      {listExpanded && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 15,
            background: 'var(--canvas)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-6)',
          }}
        >
          <ListPanel platform={platform} engine={engine} />
        </div>
      )}

      {settingsOpen && (
        <SettingsDialog
          platform={platform}
          library={library}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {dragOver && <DropOverlay />}
      <ImportProgressCard />
      <ToastHost />
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          engine={engine}
          platform={platform}
          onClose={closeContextMenu}
        />
      )}
      <FocusView platform={platform} />
      <TriageView platform={platform} />
      <SearchBar engine={engine} />
      <ShortcutListOverlay />
      <ConnectionTooltip engine={engine} />
      <ConnectionLabelDialog platform={platform} />
    </div>
  );
}
