import { Dialog, Button } from '@/design/components';
import { en } from '@/i18n/en';

export interface FolderConfirmState {
  count: number;
  skipped: number;
  onConfirm: () => void;
}

/** "Add 342 files? (12 unsupported files will be skipped)" — §2.3. */
export function FolderConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: FolderConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog title={en.folderImport.title} onClose={onCancel}>
      <p style={{ margin: '0 0 var(--space-4)', color: 'var(--text-2)' }}>
        {en.folderImport.confirm(state.count, state.skipped)}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="ghost" onClick={onCancel}>
          {en.folderImport.cancel}
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {en.folderImport.add}
        </Button>
      </div>
    </Dialog>
  );
}
