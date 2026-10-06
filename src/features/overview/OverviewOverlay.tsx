import { X } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { CRITERION_COLOR } from '@/canvas/criterionColor';
import { Button, IconButton, Slider, Tabs } from '@/design/components';
import { useLibraryStore } from '@/state/libraryStore';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { prefersReducedMotion } from '@/lib/motion';
import type { Criterion } from '@/lib/connections';
import { en } from '@/i18n/en';
import { OverviewCanvas } from './OverviewCanvas';
import { useOverviewData } from './useOverviewData';
import { OVERVIEW_SPACING_MAX, OVERVIEW_SPACING_MIN, useOverviewStore } from './overviewStore';
import { useEscape } from '@/app/useEscape';

const CRITERION_LABEL: Record<Criterion, string> = {
  type: en.connections.criterionType,
  vibe: en.connections.criterionVibe,
  movement: en.connections.criterionMovement,
  tag: en.connections.criterionTag,
  color: en.connections.criterionColor,
  manual: en.connections.criterionManual,
};

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The Overview (Patch 1 · G2): your whole space on one full-window layer, above the map and below
 * dialogs. Double-click a node to go to it; Esc or × closes it without touching the camera. */
export function OverviewOverlay({
  platform,
  engine,
}: {
  platform: Platform;
  engine: Engine | null;
}) {
  const open = useOverviewStore((s) => s.open);
  const layout = useOverviewStore((s) => s.layout);
  const nodes = useOverviewStore((s) => s.nodes);
  const criteria = useConnectionsUiStore((s) => s.activeCriteria);
  const spacing = useOverviewStore((s) => s.spacing);
  const focusHubKey = useOverviewStore((s) => s.focusHubKey);
  const { model, live, fitKey, status, retry, dragNode, releaseNode } = useOverviewData(platform);

  // Esc steps back one level: first a clicked star, then the Overview itself.
  useEscape(
    open,
    () => {
      const store = useOverviewStore.getState();
      if (store.focusHubKey) store.setFocusHubKey(null);
      else store.hide();
    },
    { allowWhileTyping: true },
  );

  if (!open) return null;

  function openItem(id: string): void {
    useOverviewStore.getState().hide();
    useLibraryStore.getState().setSelection([id]);
    engine?.setSelection([id]);
    engine?.zoomToIds([id], prefersReducedMotion());
  }

  const empty = model.nodes.length === 0;
  return (
    <div
      data-testid="overview"
      role="dialog"
      aria-label={en.overview.title}
      style={{ position: 'fixed', inset: 0, zIndex: 18, background: css(0x170b1c) }}
    >
      <OverviewCanvas
        model={model}
        mode={nodes}
        focusHubKey={focusHubKey}
        onFocusHub={(key) => useOverviewStore.getState().setFocusHubKey(key)}
        onOpen={openItem}
        live={live}
        fitKey={fitKey}
        onDragNode={dragNode}
        onReleaseNode={releaseNode}
      />

      <div
        style={{
          position: 'absolute',
          top: 'var(--space-4)',
          left: 'var(--space-4)',
          // Leaves room for the close button; the bar wraps as a whole instead of squeezing labels.
          right: 'calc(var(--space-4) + var(--hit-target-min) + var(--space-4))',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          alignItems: 'center',
        }}
      >
        <Tabs
          aria-label={en.overview.title}
          value={layout}
          onChange={(v) => useOverviewStore.getState().setLayout(v)}
          tabs={[
            { id: 'clusters', label: en.overview.clusters },
            { id: 'mine', label: en.overview.myLayout },
          ]}
        />
        <Tabs
          aria-label={en.overview.thumbnails}
          value={nodes}
          onChange={(v) => useOverviewStore.getState().setNodes(v)}
          tabs={[
            { id: 'thumbnails', label: en.overview.thumbnails },
            { id: 'dots', label: en.overview.dots },
          ]}
        />
        {layout === 'clusters' && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--text-2)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {en.overview.spacing}
            <Slider
              aria-label={en.overview.spacing}
              min={OVERVIEW_SPACING_MIN}
              max={OVERVIEW_SPACING_MAX}
              step={0.1}
              value={spacing}
              onChange={(e) => useOverviewStore.getState().setSpacing(Number(e.target.value))}
            />
          </label>
        )}
        {status === 'failed' && (
          <span
            role="alert"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--danger)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {en.overview.layoutFailed}
            <Button variant="secondary" onClick={retry}>
              {en.overview.tryAgain}
            </Button>
          </span>
        )}
      </div>

      <div style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)' }}>
        <IconButton
          icon={<X size={20} strokeWidth={1.75} />}
          label={en.overview.close}
          shortcut="Esc"
          tooltipPlacement="bottom"
          onClick={() => useOverviewStore.getState().hide()}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 'var(--space-4)',
          bottom: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          color: 'var(--text-2)',
          fontSize: 'var(--text-sm)',
        }}
      >
        {criteria.map((c) => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: css(CRITERION_COLOR[c]),
              }}
            />
            {CRITERION_LABEL[c]}
          </span>
        ))}
        {model.tooLong && <span style={{ color: 'var(--danger)' }}>{en.overview.tooLong}</span>}
      </div>

      <span
        style={{
          position: 'absolute',
          right: 'var(--space-4)',
          bottom: 'var(--space-4)',
          color: 'var(--text-3)',
          fontSize: 'var(--text-sm)',
        }}
      >
        {empty ? en.overview.empty : en.overview.hint}
      </span>
    </div>
  );
}
