import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Dialog } from '@/design/components';
import { usePdfPickerStore, type PdfPageRequest } from '@/state/pdfPickerStore';
import { openPdfDocument, renderPdfPage, type OpenPdfHandle } from '@/lib/pdfRender';
import { formatPageRange, parsePageRange } from '@/lib/pageRange';
import { logger } from '@/lib/logger';
import { en } from '@/i18n/en';

const BOX_PX = 130;
const THUMB_LONG_SIDE = 160;

/** The window that asks which pages of a PDF to add (Patch 2 · G2). It answers the first request of
 * `pdfPickerStore` and then shows the next one, if any. */
export function PdfPagePicker() {
  const request = usePdfPickerStore((s) => s.current);
  if (!request) return null;
  // One instance per request: its own document, selection and thumbnails.
  return <Picker key={`${request.name}-${request.bytes.byteLength}`} request={request} />;
}

function Picker({ request }: { request: PdfPageRequest }) {
  const [handle, setHandle] = useState<OpenPdfHandle | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState('');
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const handleRef = useRef<OpenPdfHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await openPdfDocument(request.bytes.slice(0));
        if (cancelled) {
          void opened.destroy();
          return;
        }
        handleRef.current = opened;
        setHandle(opened);
        setPageCount(opened.doc.numPages);
      } catch (err) {
        logger.warn('Page picker could not open the PDF', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      const h = handleRef.current;
      handleRef.current = null;
      if (h) void h.destroy();
    };
  }, [request]);

  function finish(choice: 'cancel' | 'whole' | 'pages'): void {
    const { answer: reply } = usePdfPickerStore.getState();
    if (choice === 'cancel') return reply(null);
    if (choice === 'whole') return reply({ kind: 'whole' });
    const doc = handle?.doc;
    if (!doc) return reply(null);
    const indices = [...selected].sort((a, b) => a - b);
    void (async () => {
      const aspects: number[] = [];
      for (const i of indices) {
        const page = await doc.getPage(i + 1);
        const vp = page.getViewport({ scale: 1 }); // accounts for the page's rotation
        aspects.push(vp.width / vp.height);
        page.cleanup();
      }
      reply({ kind: 'pages', pageIndices: indices, aspects });
    })();
  }

  function setSelection(next: Set<number>): void {
    setSelected(next);
    setRangeText(formatPageRange([...next]));
    setRangeInvalid(false);
  }

  function toggle(i: number): void {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelection(next);
  }

  function onRangeChange(text: string): void {
    setRangeText(text);
    const parsed = parsePageRange(text, pageCount);
    if (parsed === null) {
      setRangeInvalid(true); // nothing changes while the text is not a valid range
      return;
    }
    setRangeInvalid(false);
    setSelected(new Set(parsed));
  }

  const k = selected.size;

  return (
    <Dialog
      title={en.pdfPages.pickTitle(request.name)}
      onClose={() => finish('cancel')}
      className="ds-pdf-picker"
    >
      <div style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <span style={{ color: 'var(--text-3)' }}>{en.pdfPages.pages(pageCount)}</span>
          <Button
            variant="secondary"
            onClick={() => setSelection(new Set(Array.from({ length: pageCount }, (_, i) => i)))}
          >
            {en.pdfPages.selectAll}
          </Button>
          <Button variant="secondary" onClick={() => setSelection(new Set())}>
            {en.pdfPages.none}
          </Button>
          <input
            aria-label={en.pdfPages.rangeLabel}
            className="ds-chip-input__field"
            placeholder={en.pdfPages.rangePlaceholder}
            value={rangeText}
            style={{ width: 200, outline: rangeInvalid ? '2px solid var(--danger)' : undefined }}
            onChange={(e) => onRangeChange(e.target.value)}
          />
          <span style={{ marginLeft: 'auto', color: 'var(--text-2)' }}>
            {en.pdfPages.selectedOf(k, pageCount)}
          </span>
        </div>

        {failed ? (
          <p style={{ color: 'var(--danger)' }}>{en.pdfPages.readFailed}</p>
        ) : (
          <div
            data-testid="pdf-page-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 'var(--space-3)',
              maxHeight: '56vh',
              overflowY: 'auto',
              padding: 4,
            }}
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <PageTile
                key={i}
                index={i}
                doc={handle?.doc ?? null}
                selected={selected.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-4)',
          }}
        >
          <Button variant="ghost" onClick={() => finish('cancel')}>
            {en.pdfPages.cancel}
          </Button>
          {request.mode === 'import' ? (
            <>
              <Button variant="secondary" onClick={() => finish('whole')}>
                {en.pdfPages.addAsOne}
              </Button>
              <Button variant="primary" disabled={k === 0} onClick={() => finish('pages')}>
                {en.pdfPages.addSeparately(k)}
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={k === 0} onClick={() => finish('pages')}>
              {en.pdfPages.addPages(k)}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function PageTile({
  index,
  doc,
  selected,
  onToggle,
}: {
  index: number;
  doc: OpenPdfHandle['doc'] | null;
  selected: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0.707);
  const started = useRef(false);

  // Draw the page only once its tile scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || !doc) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || started.current) return;
      started.current = true;
      observer.disconnect();
      void renderPdfPage(doc, index + 1, THUMB_LONG_SIDE)
        .then((canvas) => {
          setAspect(canvas.width / canvas.height);
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          canvas.style.display = 'block';
          holder.current?.replaceChildren(canvas);
        })
        .catch((err: unknown) => logger.warn('Page thumbnail failed', err));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc, index]);

  const w = aspect >= 1 ? BOX_PX : BOX_PX * aspect;
  const h = aspect >= 1 ? BOX_PX / aspect : BOX_PX;
  return (
    <button
      ref={ref}
      type="button"
      data-testid="pdf-page-tile"
      aria-pressed={selected}
      aria-label={en.pdfPages.pageN(index + 1)}
      onClick={onToggle}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        color: 'var(--text-2)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div
        style={{
          width: BOX_PX,
          height: BOX_PX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={holder}
          style={{
            position: 'relative',
            width: w,
            height: h,
            background: 'var(--surface-3)',
            borderRadius: 4,
            overflow: 'hidden',
            outline: selected ? '3px solid var(--accent)' : '1px solid var(--hairline)',
            outlineOffset: 2,
          }}
        />
        {selected && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              marginLeft: BOX_PX - 24,
              marginTop: -(BOX_PX - 24),
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={14} strokeWidth={2.5} />
          </span>
        )}
      </div>
      <span style={{ fontSize: 'var(--text-xs)' }}>{index + 1}</span>
    </button>
  );
}
