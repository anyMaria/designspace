import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { Button, IconButton, Tabs } from '@/design/components';
import { en } from '@/i18n/en';
import { useColorStudioStore } from './colorStudioStore';

const SHOWN_PROPOSALS = 6;

/** Generate (Patch 2 · E5): Space proposes new colors for every unlocked spot; ← / → walk through
 * the proposals so far. */
export function GenerateTab() {
  const mode = useColorStudioStore((s) => s.generateMode);
  const history = useColorStudioStore((s) => s.history);
  const index = useColorStudioStore((s) => s.historyIndex);
  const store = useColorStudioStore.getState;

  // The last few proposals, newest first, each with its place in the full list.
  const recent = history
    .map((hexes, i) => ({ hexes, i }))
    .slice(-SHOWN_PROPOSALS)
    .reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Tabs
          aria-label={en.colorStudio.tabGenerate}
          value={mode}
          onChange={(m) => store().setGenerateMode(m)}
          tabs={[
            { id: 'harmonious', label: en.colorStudio.modeHarmonious },
            { id: 'random', label: en.colorStudio.modeRandom },
          ]}
        />
        <span style={{ flex: 1 }} />
        <IconButton
          icon={<ChevronLeft size={18} />}
          label="Previous proposal"
          disabled={index <= 0}
          onClick={() => store().goHistory(index - 1)}
        />
        <span data-testid="proposal-count" style={{ color: 'var(--text-2)' }}>
          {en.colorStudio.proposal(index + 1, history.length)}
        </span>
        <IconButton
          icon={<ChevronRight size={18} />}
          label="Next proposal"
          disabled={index >= history.length - 1}
          onClick={() => store().goHistory(index + 1)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Button variant="primary" onClick={() => store().generate(mode)}>
          <Shuffle size={14} style={{ marginRight: 6 }} />
          {en.colorStudio.newColors}
        </Button>
        <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
          {en.colorStudio.keysHint}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {recent.map(({ hexes, i }) => (
          <button
            key={i}
            type="button"
            data-testid="proposal-row"
            onClick={() => store().goHistory(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-2) var(--space-3)',
              border: 'none',
              borderRadius: 12,
              background: i === index ? 'var(--surface-1)' : 'transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', gap: 4 }}>
              {hexes.map((hex, k) => (
                <span key={k} style={{ width: 44, height: 28, borderRadius: 6, background: hex }} />
              ))}
            </span>
            <span style={{ color: i === index ? 'var(--text-1)' : undefined }}>
              {i === index ? (
                <strong>{en.colorStudio.now}</strong>
              ) : (
                en.colorStudio.proposalN(i + 1)
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
