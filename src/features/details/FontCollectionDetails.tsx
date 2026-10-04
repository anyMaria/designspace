import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { IconButton } from '@/design/components';
import { useHistoryStore } from '@/commands/history';
import {
  createRemoveFromFontCollectionCommand,
  createRenameFontCollectionCommand,
  createReorderFontCollectionCommand,
} from '@/commands/fontCollectionCommands';
import { useLibraryStore } from '@/state/libraryStore';
import { en } from '@/i18n/en';

/** Details of a type collection (Patch 2 · F5): its name and the list of families, which can be
 * reordered and removed. Each change is one undoable command. */
export function FontCollectionDetails({ platform, item }: { platform: Platform; item: Item }) {
  const ids = item.fontCollection?.ids ?? [];
  const items = useLibraryStore((s) => s.items);
  const run = (command: ReturnType<typeof createReorderFontCollectionCommand>) =>
    void useHistoryStore.getState().execute(command);

  function move(index: number, by: -1 | 1): void {
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    run(createReorderFontCollectionCommand(platform, item.id, next));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <input
        aria-label={en.fontCollection.name}
        key={item.title}
        className="ds-chip-input__field"
        defaultValue={item.title}
        onBlur={(e) => {
          if (e.target.value !== item.title)
            run(createRenameFontCollectionCommand(platform, item.id, e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <strong style={{ fontSize: 'var(--text-sm)' }}>{en.fontCollection.members}</strong>
      <div role="list" aria-label={en.fontCollection.members}>
        {ids.map((id, i) => (
          <div
            key={id}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: 'var(--space-1) 0',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {items.get(id)?.title ?? ''}
            </span>
            <IconButton
              icon={<ArrowUp size={14} strokeWidth={1.75} />}
              label={en.fontCollection.moveUp}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <IconButton
              icon={<ArrowDown size={14} strokeWidth={1.75} />}
              label={en.fontCollection.moveDown}
              disabled={i === ids.length - 1}
              onClick={() => move(i, 1)}
            />
            <IconButton
              icon={<X size={14} strokeWidth={1.75} />}
              label={en.fontCollection.removeFamily}
              onClick={() => run(createRemoveFromFontCollectionCommand(platform, item.id, id))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
