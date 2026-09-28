import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useNoteEditStore } from '@/state/noteEditStore';
import { useHistoryStore } from '@/commands/history';
import { createSaveNoteBodyCommand } from '@/commands/noteCommands';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import { noteColorNames, noteColors, type NoteColor } from '@/design/tokens';
import { noteExtensions, emptyNoteBody } from '@/lib/noteText';
import { en } from '@/i18n/en';

const MIN_OVERLAY_SIZE_PX = 180;

/** §2.11 "TipTap editing in place (DOM overlay)" — a positioned `<div>` layered over the note's
 * current on-screen rect, tracked every frame via `engine.getScreenRect` (there's no
 * camera-change event to subscribe to instead — see `Engine.getScreenRect`'s doc comment).
 * Re-keyed by item id from the wrapper below so each note gets a fresh `useEditor` instance
 * rather than trying to resync TipTap's own content prop across re-renders. */
function NoteEditorInner({
  itemId,
  platform,
  engine,
}: {
  itemId: string;
  platform: Platform;
  engine: Engine;
}) {
  const item = useLibraryStore((s) => s.items.get(itemId));
  const [rect, setRect] = useState(() => engine.getScreenRect(itemId));
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: noteExtensions,
    content: (item?.body as object | null) ?? emptyNoteBody(),
    autofocus: 'end',
  });

  useEffect(() => {
    function tick() {
      setRect(engine.getScreenRect(itemId));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, itemId]);

  function save(): void {
    if (!editor) return;
    void useHistoryStore
      .getState()
      .execute(createSaveNoteBodyCommand(platform, itemId, editor.getJSON(), editor.getText()));
  }

  function close(): void {
    save();
    useNoteEditStore.getState().close();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` reads fresh state via getState()
  }, []);

  function onDocumentMouseDown(e: MouseEvent): void {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
  }
  useEffect(() => {
    window.addEventListener('mousedown', onDocumentMouseDown, true);
    return () => window.removeEventListener('mousedown', onDocumentMouseDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` reads fresh state via getState()
  }, []);

  function setColor(color: NoteColor): void {
    void useHistoryStore
      .getState()
      .execute(createSetItemFieldCommand(platform, itemId, 'color', color));
  }

  if (!item || item.kind !== 'note' || !rect) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.w, MIN_OVERLAY_SIZE_PX),
        height: Math.max(rect.h, MIN_OVERLAY_SIZE_PX),
        background: `var(--${item.color ?? 'cream'})`,
        color: 'var(--canvas)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-float)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 6,
          borderBottom: '1px solid rgba(0,0,0,0.12)',
        }}
      >
        {noteColorNames.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={en.notes.colorLabel(name)}
            onClick={() => setColor(name)}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: item.color === name ? '2px solid var(--canvas)' : '1px solid rgba(0,0,0,0.2)',
              background: `#${noteColors[name].toString(16).padStart(6, '0')}`,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
      <div
        style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)' }}
        className="ds-note-editor"
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** Mounted once in the app shell; renders nothing unless `noteEditStore` has an open note. */
export function NoteEditor({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const itemId = useNoteEditStore((s) => s.itemId);
  if (!itemId || !engine) return null;
  return <NoteEditorInner key={itemId} itemId={itemId} platform={platform} engine={engine} />;
}
