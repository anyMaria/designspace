import { useState, type ReactNode } from 'react';
import {
  Plus,
  Search as SearchIcon,
  MousePointer2,
  Hand,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Panel,
  Dock,
  DockDivider,
  Tabs,
  Chip,
  ChipInput,
  SearchField,
  Menu,
  Popover,
  Tooltip,
  Toast,
  Slider,
  Toggle,
  ProgressBar,
  Kbd,
  Swatch,
  EmptyState,
} from './components';

/**
 * Dev-only page showing every design-system component together, per §3.3.
 * Reached at /design in the browser dev build (see src/app/App.tsx).
 */
export function DesignPage() {
  const [tab, setTab] = useState<'list' | 'details'>('list');
  const [tags, setTags] = useState(['grain', 'serif']);
  const [toggled, setToggled] = useState(true);

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        overflow: 'auto',
      }}
    >
      <h1 className="font-display">Designspace — components</h1>

      <Section title="Buttons">
        <Row>
          <Button variant="primary" icon={<Plus size={18} />}>
            Add
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
      </Section>

      <Section title="Icon buttons">
        <Row>
          <IconButton
            icon={<MousePointer2 size={20} strokeWidth={1.75} />}
            label="Select tool"
            active
          />
          <IconButton icon={<Hand size={20} strokeWidth={1.75} />} label="Hand tool" />
          <IconButton icon={<SettingsIcon size={20} strokeWidth={1.75} />} label="Settings" />
        </Row>
      </Section>

      <Section title="Dock">
        <Dock>
          <IconButton icon={<Plus size={20} strokeWidth={1.75} />} label="Add" active />
          <IconButton icon={<SearchIcon size={20} strokeWidth={1.75} />} label="Search" />
          <DockDivider />
          <IconButton icon={<MousePointer2 size={20} strokeWidth={1.75} />} label="Select tool" />
          <IconButton icon={<Hand size={20} strokeWidth={1.75} />} label="Hand tool" />
        </Dock>
      </Section>

      <Section title="Tabs">
        <Tabs
          aria-label="Panel"
          tabs={[
            { id: 'list', label: 'List' },
            { id: 'details', label: 'Details' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Section>

      <Section title="Chips">
        <Row>
          <Chip dotColor="var(--criterion-vibe)">Dreamy</Chip>
          <Chip variant="suggestion">Bold</Chip>
          <Chip variant="excluded">Playful</Chip>
          <Chip onRemove={() => {}}>Removable</Chip>
        </Row>
      </Section>

      <Section title="Chip input">
        <div style={{ maxWidth: 360 }}>
          <ChipInput
            values={tags}
            onAdd={(v) => setTags((t) => [...t, v])}
            onRemove={(v) => setTags((t) => t.filter((x) => x !== v))}
            placeholder="Add a tag…"
          />
        </div>
      </Section>

      <Section title="Search field">
        <SearchField placeholder="Search your library…" style={{ maxWidth: 360 }} />
      </Section>

      <Section title="Menu">
        <div style={{ maxWidth: 220 }}>
          <Menu
            aria-label="Item actions"
            items={[
              { id: 'open', label: 'Open', onSelect: () => {} },
              { id: 'similar', label: 'Find similar', onSelect: () => {}, disabled: true },
              { id: 'trash', label: 'Move to Trash', onSelect: () => {} },
            ]}
          />
        </div>
      </Section>

      <Section title="Popover">
        <Popover style={{ maxWidth: 280 }}>
          <p style={{ margin: 0 }}>Connections popover content goes here.</p>
        </Popover>
      </Section>

      <Section title="Tooltip">
        <Tooltip label="Add files, folders, links, notes and swatches">
          <Button variant="secondary">Hover me</Button>
        </Tooltip>
      </Section>

      <Section title="Toast">
        <Toast message="Moved 3 items to Trash" onAction={() => {}} />
      </Section>

      <Section title="Slider, toggle, progress">
        <Row>
          <Slider defaultValue={50} style={{ width: 160 }} />
          <Toggle checked={toggled} onChange={setToggled} label="Reduce motion" />
          <div style={{ width: 160 }}>
            <ProgressBar value={0.42} label="Importing" />
          </div>
        </Row>
      </Section>

      <Section title="Kbd">
        <Row>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </Row>
      </Section>

      <Section title="Swatches">
        <Row>
          <Swatch hex="#E9A845" name="Amber" />
          <Swatch hex="#93B89D" name="Sage" />
          <Swatch hex="#F0B7B3" name="Blush" />
        </Row>
      </Section>

      <Section title="Panel">
        <Panel style={{ padding: 'var(--space-4)', maxWidth: 320 }}>A raised panel surface.</Panel>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="Nothing here yet"
          description="Drop images anywhere, paste with Ctrl+V, or press + Add."
          action={<Button variant="primary">+ Add</Button>}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-2)', margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}
