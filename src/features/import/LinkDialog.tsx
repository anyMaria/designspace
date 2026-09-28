import { useState } from 'react';
import { Dialog, Button } from '@/design/components';
import { en } from '@/i18n/en';

/** The Add menu's "Link…" entry (§2.3, Ctrl+L) — a small URL field rather than a full form; the
 * title/description/cover all come from `net_link_meta` after submit, not typed in here. */
export function LinkDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState('');

  function submit(): void {
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <Dialog title={en.link.dialogTitle} onClose={onClose}>
      <input
        type="url"
        autoFocus
        value={url}
        placeholder={en.link.urlPlaceholder}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        style={{
          width: '100%',
          padding: 'var(--space-2)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--hairline)',
          background: 'var(--surface-1)',
          color: 'var(--text-1)',
          marginBottom: 'var(--space-4)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="ghost" onClick={onClose}>
          {en.link.cancel}
        </Button>
        <Button variant="primary" onClick={submit}>
          {en.link.add}
        </Button>
      </div>
    </Dialog>
  );
}
