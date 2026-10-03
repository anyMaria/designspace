import { useImportStore } from '@/state/importStore';
import { Panel, ProgressBar, Button } from '@/design/components';
import { en } from '@/i18n/en';

/** "Adding 37 of 120… Cancel" — §2.3, bottom-right. */
export function ImportProgressCard() {
  const active = useImportStore((s) => s.active);
  const total = useImportStore((s) => s.total);
  const done = useImportStore((s) => s.done);
  const cancel = useImportStore((s) => s.cancel);

  if (!active) return null;

  return (
    <Panel
      style={{
        position: 'absolute',
        bottom: 'var(--space-4)',
        right: 'var(--space-4)',
        zIndex: 3,
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
      }}
    >
      <span style={{ minWidth: '16ch', textAlign: 'center' }}>
        {en.importProgress.adding(done, total)}
      </span>
      <ProgressBar
        value={total > 0 ? done / total : undefined}
        label={en.importProgress.adding(done, total)}
      />
      <Button variant="ghost" onClick={cancel}>
        {en.importProgress.cancel}
      </Button>
    </Panel>
  );
}
