import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button } from '@/design/components';
import { useHistoryStore } from '@/commands/history';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import { useNoteEditStore } from '@/state/noteEditStore';
import { noteColorNames, noteColors, type NoteColor } from '@/design/tokens';
import { extractHashtags } from '@/lib/hashtags';
import { en } from '@/i18n/en';

/** Details for one selected note (Patch 1 · D3): a note is something you write, not something you
 * collect, so no Type/Vibe/Movement/Tags/Artist/Source/Why: just its colour, an Edit button and
 * the #actions written in it. */
export function NoteDetails({ platform, item }: { platform: Platform; item: Item }) {
  const current = (item.color as NoteColor | null) ?? 'cream';
  const tags = extractHashtags(item.bodyText ?? '');

  function setColor(color: NoteColor): void {
    void useHistoryStore
      .getState()
      .execute(createSetItemFieldCommand(platform, item.id, 'color', color));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
          {en.notes.colors}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {noteColorNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={en.notes.colorLabel(name)}
              aria-pressed={name === current}
              onClick={() => setColor(name)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                padding: 0,
                background: `#${noteColors[name].toString(16).padStart(6, '0')}`,
                border: name === current ? '2px solid var(--text-1)' : '1px solid var(--hairline)',
              }}
            />
          ))}
        </div>
      </div>

      <Button variant="secondary" onClick={() => useNoteEditStore.getState().open(item.id)}>
        {en.notes.edit}
      </Button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ color: 'var(--text-2)', fontSize: 'var(--text-sm)' }}>
          {en.notes.actionsHeading}
        </span>
        {tags.length === 0 ? (
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            {en.notes.noActions}
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {tags.map((t) => (
              <span key={t} className="ds-chip">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
