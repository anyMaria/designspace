import { useState } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import { Dialog } from '@/design/components';
import { en } from '@/i18n/en';
import { DropInspector } from '@/features/diagnostics/DropInspector';
import { TrashSection } from '@/features/trash/TrashSection';

type Section = 'library' | 'canvas' | 'contentNetwork' | 'vocabularies' | 'ai' | 'about';

const SECTIONS: Section[] = ['library', 'canvas', 'contentNetwork', 'vocabularies', 'ai', 'about'];

export interface SettingsDialogProps {
  platform: Platform;
  library: LibraryInfo;
  onClose: () => void;
}

/** Settings shell (§2.14). Only About → Diagnostics is functional in M0; the rest are
 * placeholders that name the milestone that fills them in. */
export function SettingsDialog({ platform, library, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<Section>('about');

  return (
    <Dialog title={en.settings.title} onClose={onClose}>
      <div style={{ display: 'flex', gap: 'var(--space-5)', minHeight: 320 }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
          {SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className="ds-menu__item"
              aria-current={section === id}
              style={
                section === id
                  ? { background: 'var(--surface-2)', color: 'var(--text-1)' }
                  : undefined
              }
              onClick={() => setSection(id)}
            >
              {en.settings.nav[id]}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1 }}>
          {section === 'about' ? (
            <AboutSection platform={platform} library={library} />
          ) : section === 'library' ? (
            <LibrarySection platform={platform} />
          ) : (
            <p style={{ color: 'var(--text-2)' }}>{milestoneFor(section)}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function milestoneFor(section: Exclude<Section, 'about' | 'library'>): string {
  const table: Record<Exclude<Section, 'about' | 'library'>, string> = {
    canvas:
      'Wheel mode, dot grid density and reduced motion land alongside the canvas engine, M0–M1.',
    contentNetwork: 'Link previews, image downloads and Offline mode land in M5.',
    vocabularies: 'The vocabulary manager lands in M2.',
    ai: 'Offline AI settings land in M6.',
  };
  return table[section];
}

function LibrarySection({ platform }: { platform: Platform }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <TrashSection platform={platform} />
      <p style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
        Location, recent libraries and the backups UI land alongside this section's remaining
        checklist items.
      </p>
    </div>
  );
}

function AboutSection({ platform, library }: { platform: Platform; library: LibraryInfo }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Row label={en.settings.about.version} value="0.1.0-dev" />
      <Row label="Library" value={`${library.name} (${platform.kind})`} />
      <Row label="Path" value={library.path} />
      <button
        type="button"
        className="ds-menu__item"
        onClick={() => setShowDiagnostics((v) => !v)}
        style={{ marginTop: 'var(--space-2)' }}
      >
        {en.settings.about.diagnostics}
      </button>
      {showDiagnostics && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-3)' }}>
          <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-md)' }}>
            {en.settings.diagnostics.dropInspector}
          </h3>
          <DropInspector />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
