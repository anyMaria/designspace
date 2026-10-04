import { useMemo, useState, type ReactNode } from 'react';
import type { Platform } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import { useBoardStore } from '@/state/boardStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useExportUiStore } from '@/state/exportUiStore';
import { useToastStore } from '@/state/toastStore';
import { exportSpace, type ExportArea } from './exportSpace';
import type { ExportBackground, ExportScale } from '@/lib/exportGeometry';
import { Dialog, Button, Tabs } from '@/design/components';
import { en } from '@/i18n/en';

/** §2.11 Export: PNG (1×/2×, choice of background) or a one-page PDF, of the whole space or just
 * the selected items. Opened from the top bar's "Export…" button next to the space switcher. */
export function ExportDialog({ platform, engine }: { platform: Platform; engine: Engine }) {
  const open = useExportUiStore((s) => s.open);
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const selection = useLibraryStore((s) => s.selection);

  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  // null = the owner hasn't chosen: Selection when something is selected, else the whole board.
  const [areaChoice, setAreaChoice] = useState<ExportArea | null>(null);
  const [scale, setScale] = useState<ExportScale>(1);
  const [background, setBackground] = useState<ExportBackground>('dots');
  const [pageSize, setPageSize] = useState<'a4' | 'a3'>('a4');
  const [exporting, setExporting] = useState(false);

  const spaceTitle = useMemo(() => {
    const current = currentBoardId ? boards.get(currentBoardId) : null;
    return current && current.kind === 'board' ? current.name : en.spaceSwitcher.library;
  }, [boards, currentBoardId]);

  const ids = useMemo(() => [...selection], [selection]);
  const area: ExportArea = ids.length === 0 ? 'all' : (areaChoice ?? 'selection');

  if (!open) return null;

  function close(): void {
    useExportUiStore.getState().setOpen(false);
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const result =
        format === 'png'
          ? await exportSpace(platform, engine, spaceTitle, {
              format: 'png',
              scale,
              background,
              area,
              ids,
            })
          : await exportSpace(platform, engine, spaceTitle, {
              format: 'pdf',
              background,
              pageSize,
              area,
              ids,
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

        <Field label={en.export.area}>
          <Tabs
            aria-label={en.export.area}
            value={area}
            onChange={setAreaChoice}
            tabs={[
              { id: 'all', label: en.export.areaAll },
              { id: 'selection', label: en.export.areaSelection(ids.length) },
            ]}
          />
        </Field>

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
