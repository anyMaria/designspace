import { useEffect, useState } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import type { ItemKind } from '@/state/types';
import { Button, Dialog } from '@/design/components';
import { en } from '@/i18n/en';
import { formatBytes } from '@/lib/formatBytes';
import { logger } from '@/lib/logger';
import { DropInspector } from '@/features/diagnostics/DropInspector';
import { loadLibraryStats, type LibraryStats } from './libraryStats';
import { LibrarySection } from './LibrarySection';
import { CanvasSection } from './CanvasSection';
import { VocabularySection } from './VocabularySection';
import { ContentNetworkSection } from './ContentNetworkSection';
import { AiSection } from './AiSection';

type Section = 'library' | 'canvas' | 'contentNetwork' | 'vocabularies' | 'ai' | 'about';

const SECTIONS: Section[] = ['library', 'canvas', 'contentNetwork', 'vocabularies', 'ai', 'about'];

export interface SettingsDialogProps {
  platform: Platform;
  library: LibraryInfo;
  onClose: () => void;
}

/** Settings shell (§2.14): Library, Canvas, Content & network, Vocabularies, AI and About. */
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
            <LibrarySection platform={platform} library={library} />
          ) : section === 'canvas' ? (
            <CanvasSection />
          ) : section === 'vocabularies' ? (
            <VocabularySection platform={platform} />
          ) : section === 'contentNetwork' ? (
            <ContentNetworkSection platform={platform} />
          ) : (
            <AiSection platform={platform} />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function AboutSection({ platform, library }: { platform: Platform; library: LibraryInfo }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const isTauri = platform.kind === 'tauri';

  useEffect(() => {
    async function run(): Promise<void> {
      setStats(await loadLibraryStats(platform));
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- platform is stable for the app's lifetime
  }, []);

  async function openLogs(): Promise<void> {
    try {
      await platform.app.openLogs();
    } catch (err) {
      logger.error('Opening the logs folder failed', err);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Row label={en.settings.about.version} value="0.1.0-dev" />
      <Row label="Library" value={`${library.name} (${platform.kind})`} />
      <Row label="Path" value={library.path} />
      {stats && (
        <>
          <Row
            label={en.settings.about.itemCounts}
            value={en.settings.about.itemCountsSummary(
              stats.totalItems,
              itemCountsBreakdown(stats),
            )}
          />
          <Row label={en.settings.about.diskUsage} value={formatBytes(stats.totalBytes)} />
        </>
      )}
      {isTauri && (
        <Button variant="ghost" onClick={() => void openLogs()} style={{ alignSelf: 'flex-start' }}>
          {en.settings.about.openLogs}
        </Button>
      )}
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

function itemCountsBreakdown(stats: LibraryStats): string {
  return (Object.entries(stats.itemCounts) as [ItemKind, number][])
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([kind, count]) => `${count} ${en.kind[kind].toLowerCase()}${count === 1 ? '' : 's'}`)
    .join(', ');
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
