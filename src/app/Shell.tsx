import { useEffect, useState } from 'react';
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
  const [inboxCount] = useState(0);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    useLibraryStore.getState().setLibraryBoardId(libraryBoardId);
  }, [libraryBoardId]);

  useEngineBindings(engine, platform);
  useCanvasShortcuts(engine, platform);
  const { dragOver } = useDropAndPaste(engine, platform);
  const { menu: contextMenu, close: closeContextMenu } = useContextMenu(engine);
  useFocusViewBinding(engine);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <CanvasView
        tool={tool}
        wheelMode={wheelMode}
        benchCount={benchCount}
        onEngineReady={setEngine}
      />

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
          <Panel style={{ padding: 'var(--space-2) var(--space-4)' }}>
            {en.inbox.chip(inboxCount)}
          </Panel>
        )}
        <IconButton icon={<Share2 size={20} strokeWidth={1.75} />} label={en.rediscover} />
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
          <IconButton icon={<Search size={20} strokeWidth={1.75} />} label={en.dock.search} />
          <IconButton icon={<Share2 size={20} strokeWidth={1.75} />} label={en.dock.connections} />
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState
              title={en.emptyStates.libraryMap}
              action={<Button variant="primary">+ Add</Button>}
            />
          </div>
        </Panel>
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
    </div>
  );
}
