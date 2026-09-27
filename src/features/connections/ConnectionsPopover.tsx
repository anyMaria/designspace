import { useEffect } from 'react';
import { useConnectionsUiStore } from '@/state/connectionsUiStore';
import { criterionColors } from '@/design/tokens';
import type { Criterion } from '@/lib/connections';
import { Popover, Tabs, Toggle } from '@/design/components';
import { en } from '@/i18n/en';

const LIMIT_HIT_DISPLAY_MS = 2500;

/** The 6 real criteria (§2.10) — `similar` ("Similar look", cosine on CLIP embeddings) needs the
 * AI pipeline from M6 and always scores zero candidates until then (see `lib/connections.ts`), so
 * it's left out of the popover rather than shown as a toggle that visibly does nothing. */
const POPOVER_CRITERIA: Criterion[] = ['type', 'vibe', 'movement', 'tag', 'color', 'manual'];

const CRITERION_LABEL: Record<Criterion, string> = {
  type: en.connections.criterionType,
  vibe: en.connections.criterionVibe,
  movement: en.connections.criterionMovement,
  tag: en.connections.criterionTag,
  color: en.connections.criterionColor,
  manual: en.connections.criterionManual,
  similar: en.connections.criterionSimilar,
};

/** `criterionColors` keys its facet colors as `tags`, not `tag` (it mirrors the DB's plural
 * facet naming) — this resolves that the same way `Engine.ts`'s own `CRITERION_COLOR` map does,
 * so the popover's legend dots and the canvas's line colors can never drift apart. */
const CRITERION_HEX: Record<Criterion, number> = {
  type: criterionColors.type,
  vibe: criterionColors.vibe,
  movement: criterionColors.movement,
  tag: criterionColors.tags,
  color: criterionColors.color,
  manual: criterionColors.manual,
  similar: criterionColors.similar,
};

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Dock → Connections (or "C"): criteria toggles, hover/show-all mode, strength, and the
 * Constellations switch (§2.10). Show all's hub rendering (M3-4) and the Constellations layout
 * itself (M3-6/M3-7, via `useConstellationsBinding`) both read this same store, so every control
 * here changes the canvas live. */
export function ConnectionsPopover() {
  const isOpen = useConnectionsUiStore((s) => s.isOpen);
  const activeCriteria = useConnectionsUiStore((s) => s.activeCriteria);
  const mode = useConnectionsUiStore((s) => s.mode);
  const minStrength = useConnectionsUiStore((s) => s.minStrength);
  const constellationsOn = useConnectionsUiStore((s) => s.constellationsOn);
  const limitHitAt = useConnectionsUiStore((s) => s.limitHitAt);
  const showAllOverLimit = useConnectionsUiStore((s) => s.showAllOverLimit);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        useConnectionsUiStore.getState().close();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  useEffect(() => {
    if (limitHitAt === null) return;
    const timer = window.setTimeout(() => {
      if (useConnectionsUiStore.getState().limitHitAt === limitHitAt) {
        useConnectionsUiStore.setState({ limitHitAt: null });
      }
    }, LIMIT_HIT_DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [limitHitAt]);

  if (!isOpen) return null;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 2 }}
        onClick={() => useConnectionsUiStore.getState().close()}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + var(--space-2))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 3,
        }}
      >
        <Popover>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              width: 260,
              padding: 'var(--space-1)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              {POPOVER_CRITERIA.map((c) => {
                const active = activeCriteria.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className="ds-chip"
                    style={
                      active
                        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                        : undefined
                    }
                    onClick={() => useConnectionsUiStore.getState().toggleCriterion(c)}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: hexToCss(CRITERION_HEX[c]),
                        marginRight: 6,
                      }}
                    />
                    {CRITERION_LABEL[c]}
                  </button>
                );
              })}
            </div>
            {limitHitAt !== null && (
              <span style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
                {en.connections.limitHit}
              </span>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
                {en.connections.display}
              </span>
              <Tabs
                aria-label={en.connections.display}
                tabs={[
                  { id: 'hover', label: en.connections.onHover },
                  { id: 'showAll', label: en.connections.showAll },
                ]}
                value={mode}
                onChange={(v) => useConnectionsUiStore.getState().setMode(v)}
              />
              {mode === 'showAll' && showAllOverLimit && (
                <span style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
                  {en.connections.tooManyLinks}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
                {en.connections.strength(minStrength)}
              </span>
              <Tabs
                aria-label={en.connections.strength(minStrength)}
                tabs={[
                  { id: '1', label: '1' },
                  { id: '2', label: '2' },
                  { id: '3', label: '3' },
                ]}
                value={String(minStrength)}
                onChange={(v) => useConnectionsUiStore.getState().setMinStrength(Number(v))}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
              }}
            >
              <span>{en.connections.constellations}</span>
              <Toggle
                checked={constellationsOn}
                label={en.connections.constellations}
                onChange={(v) => useConnectionsUiStore.getState().setConstellationsOn(v)}
              />
            </div>
          </div>
        </Popover>
      </div>
    </>
  );
}
