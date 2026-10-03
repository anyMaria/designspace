import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useNoteEditStore } from '@/state/noteEditStore';
import { useHistoryStore } from '@/commands/history';
import { createSaveNoteBodyCommand } from '@/commands/noteCommands';
import { createSetItemFieldCommand } from '@/commands/itemCommands';
import {
  noteColorNames,
  noteColors,
  noteGeometry,
  noteStyles,
  type NoteColor,
} from '@/design/tokens';
import { noteExtensions, emptyNoteBody } from '@/lib/noteText';
import { en } from '@/i18n/en';

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
  const placement = useLibraryStore((s) => s.placements.get(itemId));
  const paperRef = useRef<HTMLDivElement>(null);
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
    // Grow the note when the text needs more room (never shrink): whole lines plus the padding.
    const { pad, lineHeight } = noteGeometry;
    const scrollHeight = paperRef.current?.scrollHeight ?? 0;
    const needed = Math.ceil((scrollHeight - 2 * pad) / lineHeight) * lineHeight + 2 * pad;
    void useHistoryStore
      .getState()
      .execute(
        createSaveNoteBodyCommand(
          platform,
          itemId,
          editor.getJSON(),
          editor.getText(),
          scrollHeight > 0 ? needed : undefined,
        ),
      );
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
    const target = e.target as Element;
    if (target.closest?.('[data-note-editor-chrome]')) return; // the colour dots
    if (containerRef.current && !containerRef.current.contains(target)) close();
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

  if (!item || item.kind !== 'note' || !rect || !placement) return null;

  const colorName = (item.color as NoteColor | null) ?? 'cream';
  const style = noteStyles[colorName] ?? noteStyles.cream;
  const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const { pad, lineHeight, fontSize } = noteGeometry;
  // Laid out in world units and scaled with the camera, so opening a note moves no letter.
  const zoom = engine.camera.zoom;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          left: rect.x,
          top: rect.y,
          width: placement.w,
          height: placement.h,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
          zIndex: 30,
        }}
      >
        <div
          ref={paperRef}
          className="ds-note-paper"
          style={
            {
              '--paper': css(noteColors[colorName]),
              '--rule': `rgba(255,255,255,${style.ruleAlpha})`,
              '--fold': css(style.fold),
              '--note-text': css(style.text),
              '--note-hash': css(style.hashtag),
              '--note-pad': `${pad}px`,
              '--note-line': `${lineHeight}px`,
              '--note-font': `${fontSize}px`,
              '--note-fold-size': `${noteGeometry.fold}px`,
              '--note-radius': `${noteGeometry.radius}px`,
            } as CSSProperties
          }
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      {/* The colour dots float above the paper (not scaled), so they never cover the text. */}
      <div
        style={{
          position: 'fixed',
          left: rect.x,
          top: rect.y - 8,
          transform: 'translateY(-100%)',
          zIndex: 31,
          display: 'flex',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-1-92)',
          border: '1px solid var(--hairline)',
          boxShadow: 'var(--shadow-float)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        data-note-editor-chrome
      >
        {noteColorNames.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={en.notes.colorLabel(name)}
            onClick={() => setColor(name)}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: colorName === name ? '2px solid var(--text-1)' : '1px solid var(--hairline)',
              background: css(noteColors[name]),
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
    </>
  );
}

/** Mounted once in the app shell; renders nothing unless `noteEditStore` has an open note. */
export function NoteEditor({ platform, engine }: { platform: Platform; engine: Engine | null }) {
  const itemId = useNoteEditStore((s) => s.itemId);
  if (!itemId || !engine) return null;
  return <NoteEditorInner key={itemId} itemId={itemId} platform={platform} engine={engine} />;
}
