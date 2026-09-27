import { useRef } from 'react';
import type { Platform } from '@/platform/types';
import { useConnectionLabelDialogStore } from '@/state/connectionLabelDialogStore';
import { useManualConnectionsStore } from '@/state/manualConnectionsStore';
import { useHistoryStore } from '@/commands/history';
import { createLabelConnectionCommand } from '@/commands/connectionCommands';
import { Dialog, Button } from '@/design/components';
import { en } from '@/i18n/en';

/** §2.10 "Double-click a line to add a label ('same typography')." Rendered once in `Shell.tsx`,
 * opened by `useManualConnectionsBinding` on `connectionLineDblClick`. */
export function ConnectionLabelDialog({ platform }: { platform: Platform }) {
  const connectionId = useConnectionLabelDialogStore((s) => s.connectionId);
  const connection = useManualConnectionsStore((s) =>
    connectionId ? s.connections.get(connectionId) : undefined,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  if (!connectionId || !connection) return null;

  function save(): void {
    const value = inputRef.current?.value.trim() || null;
    void useHistoryStore
      .getState()
      .execute(createLabelConnectionCommand(platform, connectionId!, value));
    useConnectionLabelDialogStore.getState().close();
  }

  return (
    <Dialog
      title={en.connections.labelDialogTitle}
      onClose={useConnectionLabelDialogStore.getState().close}
    >
      <form
        style={{ display: 'flex', gap: 'var(--space-2)' }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={inputRef}
          aria-label={en.connections.labelDialogTitle}
          className="ds-chip-input__field"
          defaultValue={connection.label ?? ''}
          placeholder={en.connections.labelPlaceholder}
          autoFocus
          style={{ flex: 1 }}
        />
        <Button variant="primary" type="submit">
          {en.connections.save}
        </Button>
      </form>
    </Dialog>
  );
}
