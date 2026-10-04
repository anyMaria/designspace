import { useEffect, useState } from 'react';
import type { Platform } from '@/platform';
import { Toggle, Button } from '@/design/components';
import { useSettingsStore } from '@/state/settingsStore';
import { setAiEnabled } from '@/state/loadSettings';
import { getAiQueue } from '@/workers/aiQueue';
import { useAiStatusStore } from '@/state/aiStatusStore';
import { en } from '@/i18n/en';

/** Settings → AI (§4.10, M6-5): the on/off switch, whether a real model is actually bundled in
 * this build, and live background-analysis progress with pause/resume. */
export function AiSection({ platform }: { platform: Platform }) {
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const aiStatus = useAiStatusStore((s) => s.status);
  const aiError = useAiStatusStore((s) => s.error);
  const aiProvider = useAiStatusStore((s) => s.provider);
  const [progress, setProgress] = useState({ completed: 0, pending: 0, failed: 0, paused: false });

  useEffect(() => {
    if (!aiEnabled) return;
    const queue = getAiQueue(platform);
    if (!queue) return;
    function sync(): void {
      setProgress({
        completed: queue!.completed,
        pending: queue!.pending,
        failed: queue!.failed,
        paused: queue!.isPaused,
      });
    }
    sync();
    return queue.onProgress(sync);
  }, [platform, aiEnabled]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div>{en.settings.ai.enable}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 2 }}>
            {en.settings.ai.enableDescription}
          </div>
        </div>
        <Toggle
          checked={aiEnabled}
          onChange={(checked) => void setAiEnabled(platform, checked)}
          label={en.settings.ai.enable}
        />
      </div>

      {aiEnabled && (
        <div data-testid="ai-status" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          {aiStatus === 'error' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span>
                {en.settings.ai.statusError(
                  aiError?.includes('was not found locally')
                    ? en.settings.ai.modelMissing
                    : (aiError ?? en.settings.ai.workerStopped),
                )}
              </span>
              <Button variant="secondary" onClick={() => getAiQueue(platform)?.retry()}>
                {en.settings.ai.retry}
              </Button>
            </div>
          ) : aiStatus === 'loading' ? (
            en.settings.ai.statusLoading
          ) : aiStatus === 'ready' ? (
            progress.pending > 0 ? (
              en.settings.ai.statusAnalyzing(
                progress.completed,
                progress.completed + progress.pending,
              )
            ) : (
              en.settings.ai.statusReady
            )
          ) : null}
          {aiProvider === 'fake' && (
            <p style={{ margin: 'var(--space-2) 0 0' }}>{en.settings.ai.modelNotBundled}</p>
          )}
        </div>
      )}

      {aiEnabled && aiProvider === 'clip' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <Row label={en.settings.ai.analyzed} value={String(progress.completed)} />
          <Row label={en.settings.ai.remaining} value={String(progress.pending)} />
          {progress.failed > 0 && (
            <Row label={en.settings.ai.failed} value={String(progress.failed)} />
          )}
          {progress.pending > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                const queue = getAiQueue(platform);
                if (progress.paused) queue?.resume();
                else queue?.pause();
              }}
            >
              {progress.paused ? en.settings.ai.resume : en.settings.ai.pause}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
