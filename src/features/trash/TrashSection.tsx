import { useEffect, useState } from 'react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button } from '@/design/components';
import { useHistoryStore } from '@/commands/history';
import { createRestoreItemCommand } from '@/commands/itemCommands';
import { listTrashedItems, deleteForever } from './trashActions';
import { en } from '@/i18n/en';

/** Settings → Library → Trash (§2.14, §5.4): restore, delete forever, empty now. Auto-purge after
 * 30 days runs at startup (App.tsx); this is the manual side of it. */
export function TrashSection({ platform }: { platform: Platform }) {
  const [items, setItems] = useState<Item[] | null>(null);

  async function refresh(): Promise<void> {
    setItems(await listTrashedItems(platform));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not a sync setState loop
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- platform is stable for the app's lifetime
  }, []);

  async function restore(id: string): Promise<void> {
    await useHistoryStore.getState().execute(createRestoreItemCommand(platform, id));
    await refresh();
  }

  async function removeForever(ids: string[]): Promise<void> {
    await deleteForever(platform, ids);
    await refresh();
  }

  if (items === null) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>{en.trash.title}</h3>
        {items.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm(en.trash.emptyNowConfirm(items.length))) {
                void removeForever(items.map((i) => i.id));
              }
            }}
          >
            {en.trash.emptyNow}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-2)' }}>{en.trash.empty}</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)',
              }}
            >
              {item.status === 'ok' ? (
                <img
                  src={platform.cache.url(`t128/${item.id}`)}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-3)',
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title || item.fileName}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {item.deletedAt
                    ? en.trash.deletedOn(new Date(item.deletedAt).toLocaleDateString())
                    : ''}
                </div>
              </div>
              <Button variant="ghost" onClick={() => void restore(item.id)}>
                {en.trash.restore}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm(en.trash.deleteForeverConfirm)) void removeForever([item.id]);
                }}
              >
                {en.trash.deleteForever}
              </Button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', margin: 0 }}>
        {en.trash.autoPurgeNote}
      </p>
    </div>
  );
}
