import { useEffect, useRef, useState } from 'react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button } from '@/design/components';
import { en } from '@/i18n/en';
import { logger } from '@/lib/logger';
import { openPdfDocument, renderPdfPage, type OpenPdfHandle } from '@/lib/pdfRender';
import { setPdfCoverPage } from '@/workers/pdfIngestQueue';
import { splitPdfIntoPages } from './splitPdfIntoPages';
import { useToastStore } from '@/state/toastStore';

const VIEWER_LONG_SIDE = 1400;

/** The PDF Focus viewer (§2.4's checklist: "the cover-page picker, split into pages, the Focus
 * viewer") — a basic page-by-page canvas view rather than a full PDF.js text-layer reader (no
 * pan/zoom control, per the scope trim logged in docs/DECISIONS.md); "Set as cover" is folded in
 * here rather than built as a separate thumbnail-strip picker component. */
export function PdfFocusViewer({ platform, item }: { platform: Platform; item: Item }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<OpenPdfHandle['doc'] | null>(null);
  const [page, setPage] = useState(item.coverPage ?? 1);
  const [pageCount, setPageCount] = useState(item.pageCount ?? 1);
  const [busy, setBusy] = useState(false);

  // `FocusView` mounts a fresh `PdfFocusViewer` per item (`key={item.id}`), so `page`/`pageCount`
  // already start correctly from `useState`'s initializer above — this effect only needs to open
  // the document once for this mount's lifetime.
  useEffect(() => {
    let cancelled = false;
    let handle: OpenPdfHandle | null = null;
    void (async () => {
      try {
        if (!item.filePath) return;
        const res = await fetch(platform.media.originalUrl(item.filePath));
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
        const opened = await openPdfDocument(await res.arrayBuffer());
        if (cancelled) {
          void opened.destroy();
          return;
        }
        handle = opened;
        setPageCount(opened.doc.numPages);
        setDoc(opened.doc); // a state change, so the render effect runs
      } catch (err) {
        if (!cancelled) logger.warn('Opening a PDF failed', err);
      }
    })();
    return () => {
      cancelled = true;
      void handle?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount (one item per key)
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const rendered = await renderPdfPage(doc, page, VIEWER_LONG_SIDE);
        if (cancelled) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(rendered, 0, 0);
      } catch (err) {
        // Closing the viewer (or paging quickly) destroys the document mid-render: pdf.js rejects
        // with a RenderingCancelledException, which is expected, not an error.
        if (cancelled || (err instanceof Error && err.name === 'RenderingCancelledException'))
          return;
        logger.warn('Rendering a PDF page failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page]);

  async function handleSetCover(): Promise<void> {
    if (!item.filePath || busy) return;
    setBusy(true);
    try {
      await setPdfCoverPage(platform, item.id, item.filePath, page);
    } finally {
      setBusy(false);
    }
  }

  async function handleSplit(): Promise<void> {
    if (!item.filePath || busy) return;
    setBusy(true);
    try {
      const res = await fetch(platform.media.originalUrl(item.filePath));
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${res.url}`);
      const bytes = await res.arrayBuffer();
      const count = await splitPdfIntoPages(
        platform,
        item.title || item.fileName || 'document',
        bytes,
        {
          x: 0,
          y: 0,
        },
      );
      useToastStore.getState().show(en.pdf.splitDone(count));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <canvas
        ref={canvasRef}
        data-testid="pdf-page-canvas"
        style={{
          maxWidth: '80vw',
          maxHeight: '68vh',
          objectFit: 'contain',
          borderRadius: 'var(--radius-sm)',
          background: '#ffffff',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Button
          variant="ghost"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {en.pdf.prevPage}
        </Button>
        <span style={{ color: 'var(--text-2)' }}>{en.pdf.pageOf(page, pageCount)}</span>
        <Button
          variant="ghost"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        >
          {en.pdf.nextPage}
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Button variant="secondary" disabled={busy} onClick={() => void handleSetCover()}>
          {en.pdf.setAsCover}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void handleSplit()}>
          {en.pdf.splitIntoPages}
        </Button>
      </div>
    </div>
  );
}
