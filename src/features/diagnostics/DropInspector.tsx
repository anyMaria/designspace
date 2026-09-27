import { useState, type DragEvent } from 'react';
import { en } from '@/i18n/en';

interface DropReport {
  types: string[];
  files: { name: string; type: string; size: number }[];
  uriList: string | null;
  html: string | null;
  text: string | null;
}

/** Spike S2 (§8, M0): lists every `DataTransfer` type/file a drag carries, so the owner can
 * confirm what Chrome/Edge/Firefox/Explorer actually send into WebView2 (`dragDropEnabled:
 * false`, §4.4) and send a screenshot back — this can't be exercised in the cloud session. */
export function DropInspector() {
  const [report, setReport] = useState<DropReport | null>(null);
  const [isOver, setIsOver] = useState(false);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsOver(false);
    const dt = e.dataTransfer;
    setReport({
      types: Array.from(dt.types),
      files: Array.from(dt.files).map((f) => ({ name: f.name, type: f.type, size: f.size })),
      uriList: dt.getData('text/uri-list') || null,
      html: dt.getData('text/html') || null,
      text: dt.getData('text/plain') || null,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, color: 'var(--text-2)' }}>
        {en.settings.diagnostics.dropInspectorHint}
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isOver ? 'var(--accent)' : 'var(--hairline)'}`,
          borderRadius: 'var(--radius-input)',
          padding: 'var(--space-5)',
          textAlign: 'center',
          color: 'var(--text-2)',
          background: isOver ? 'var(--surface-2)' : 'transparent',
        }}
      >
        {en.settings.diagnostics.dropHere}
      </div>

      {report ? (
        <pre
          style={{
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3)',
            fontSize: 'var(--text-xs)',
            overflow: 'auto',
            maxHeight: 240,
            margin: 0,
          }}
        >
          {JSON.stringify(report, null, 2)}
        </pre>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-3)' }}>{en.settings.diagnostics.noDropYet}</p>
      )}
    </div>
  );
}
