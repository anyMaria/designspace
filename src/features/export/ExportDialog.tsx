import { useMemo, useState, type ReactNode } from 'react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { useBoardStore } from '@/state/boardStore';
import { useFrameStore } from '@/state/frameStore';
import { useExportUiStore } from '@/state/exportUiStore';
import { useToastStore } from '@/state/toastStore';
import { exportSpace } from './exportSpace';
import type { ExportBackground, ExportScale } from '@/lib/exportGeometry';
import { Dialog, Button, Tabs, Toggle } from '@/design/components';
import { en } from '@/i18n/en';

/** §2.11 Export: PNG (whole space or one frame, 1×/2×, choice of background) or PDF (fitted, or
 * one page per frame). Opened from the top bar's "Export…" button next to the space switcher —
 * frames work on the Library map too, so this isn't board-only. */
export function ExportDialog({ platform, engine }: { platform: Platform; engine: Engine }) {
  const open = useExportUiStore((s) => s.open);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const frames = useFrameStore((s) => s.frames);

  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  const [frameId, setFrameId] = useState<string | null>(null);
  const [scale, setScale] = useState<ExportScale>(1);
  const [background, setBackground] = useState<ExportBackground>('dots');
  const [pageSize, setPageSize] = useState<'a4' | 'a3'>('a4');
  const [onePagePerFrame, setOnePagePerFrame] = useState(false);
  const [exporting, setExporting] = useState(false);

  const spaceTitle = useMemo(() => {
    const current = currentBoardId ? boards.get(currentBoardId) : null;
    return current && current.kind === 'board' ? current.name : en.spaceSwitcher.library;
  }, [boards, currentBoardId]);

  const frameList = useMemo(() => [...frames.values()], [frames]);

  if (!open) return null;

  function close(): void {
    useExportUiStore.getState().setOpen(false);
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const result =
        format === 'png'
          ? await exportSpace(platform, engine, spaceTitle, frameList, {
              format: 'png',
              scale,
              background,
              frameId,
            })
          : await exportSpace(platform, engine, spaceTitle, frameList, {
              format: 'pdf',
              background,
              pageSize,
              frameId,
              onePagePerFrame,
            });
      if (result === 'saved') {
        useToastStore.getState().show(en.export.exported);
        close();
      } else if (result === 'empty') {
        useToastStore.getState().show(en.export.nothingToExport);
      } else {
        useToastStore.getState().show(en.export.cancelled);
      }
    } catch {
      useToastStore.getState().show(en.export.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  const scopeTabs = [
    { id: 'whole', label: en.export.scopeWhole },
    ...frameList.map((f) => ({ id: f.id, label: f.title })),
  ] as const;

  return (
    <Dialog title={en.export.title} onClose={close}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: 320 }}>
        <Field label={en.export.format}>
          <Tabs
            aria-label={en.export.format}
            value={format}
            onChange={setFormat}
            tabs={[
              { id: 'png', label: en.export.formatPng },
              { id: 'pdf', label: en.export.formatPdf },
            ]}
          />
        </Field>

        {frameList.length > 0 && (
          <Field label={en.export.scope}>
            <Tabs
              aria-label={en.export.scope}
              value={frameId ?? 'whole'}
              onChange={(id) => setFrameId(id === 'whole' ? null : id)}
              tabs={scopeTabs}
            />
          </Field>
        )}

        {format === 'png' && (
          <Field label={en.export.scale}>
            <Tabs
              aria-label={en.export.scale}
              value={String(scale)}
              onChange={(id) => setScale(id === '2' ? 2 : 1)}
              tabs={[
                { id: '1', label: en.export.scale1x },
                { id: '2', label: en.export.scale2x },
              ]}
            />
          </Field>
        )}

        <Field label={en.export.background}>
          <Tabs
            aria-label={en.export.background}
            value={background}
            onChange={setBackground}
            tabs={[
              { id: 'dots', label: en.export.backgroundDots },
              { id: 'plum', label: en.export.backgroundPlum },
              { id: 'white', label: en.export.backgroundWhite },
            ]}
          />
        </Field>

        {format === 'pdf' && (
          <>
            <Field label={en.export.pageSize}>
              <Tabs
                aria-label={en.export.pageSize}
                value={pageSize}
                onChange={setPageSize}
                tabs={[
                  { id: 'a4', label: 'A4' },
                  { id: 'a3', label: 'A3' },
                ]}
              />
            </Field>
            {!frameId && frameList.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Toggle
                  checked={onePagePerFrame}
                  onChange={setOnePagePerFrame}
                  label={en.export.onePagePerFrame}
                />
                <span>{en.export.onePagePerFrame}</span>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="primary" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? en.export.exporting : en.export.action}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>{label}</span>
      {children}
    </div>
  );
}
