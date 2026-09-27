import { useState } from 'react';
import type { Platform, LibraryInfo } from '@/platform';
import { ensureLibraryReady } from '@/platform/bootstrap';
import { en } from '@/i18n/en';
import { Button } from '@/design/components';
import { logger } from '@/lib/logger';

export interface OnboardingProps {
  platform: Platform;
  onReady: (library: LibraryInfo, libraryBoardId: string) => void;
}

/** First run, §2.14 steps 1–2 (welcome + library location). "Bring in existing inspiration?"
 * (step 3) lands with Adding in M1 — for now the owner can drag files in once the map opens. */
export function Onboarding({ platform, onReady }: OnboardingProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);

  async function browse() {
    const folder = await platform.dialogs.openFolder();
    if (folder) setPath(folder);
  }

  async function createLibrary() {
    setBusy(true);
    setError(null);
    try {
      const library = await platform.library.create(path ?? undefined);
      const libraryBoardId = await ensureLibraryReady(platform);
      onReady(library, libraryBoardId);
    } catch (err) {
      logger.error('Failed to create the library', err);
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--canvas)',
      }}
    >
      <div
        className="ds-panel"
        style={{
          padding: 'var(--space-6)',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h1 className="font-display" style={{ margin: 0, fontSize: 'var(--text-2xl)' }}>
          {en.onboarding.welcomeTitle}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-2)' }}>{en.onboarding.welcomeBody}</p>

        <div>
          <h2 style={{ fontSize: 'var(--text-md)', margin: '0 0 var(--space-2)' }}>
            {en.onboarding.libraryLocationTitle}
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-2)', flex: 1, wordBreak: 'break-all' }}>
              {path ?? en.onboarding.libraryLocationDefault}
            </span>
            <Button variant="secondary" onClick={() => void browse()}>
              {en.onboarding.browse}
            </Button>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

        <Button variant="primary" disabled={busy} onClick={() => void createLibrary()}>
          {en.onboarding.createLibrary}
        </Button>
      </div>
    </div>
  );
}
