import { useEffect, useRef } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import type { Platform } from '@/platform/types';
import { useLibraryStore } from '@/state/libraryStore';
import { useHistoryStore } from '@/commands/history';
import { createSetDescriptionCommand } from '@/commands/descriptionCommands';
import { noteExtensions, emptyNoteBody } from '@/lib/noteText';
import { en } from '@/i18n/en';

/** The description, written right where it is read (Patch 3 · B2): one click puts the cursor in
 * the field, with no zoom and no panel. One undoable save per editing session: on blur, when
 * another item is shown (the parent re-keys this by item id) and when it unmounts. */
export function InlineDescription({ platform, itemId }: { platform: Platform; itemId: string }) {
  const editor = useEditor({
    extensions: noteExtensions,
    content:
      (useLibraryStore.getState().items.get(itemId)?.description as object | null | undefined) ??
      emptyNoteBody(),
  });
  const isEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  });

  const saveRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    saveRef.current = () => {
      if (!editor || editor.isDestroyed) return;
      const text = editor.getText().trim();
      const current = useLibraryStore.getState().items.get(itemId)?.descriptionText?.trim() ?? '';
      if (text === current) return; // nothing changed this session
      void useHistoryStore
        .getState()
        .execute(createSetDescriptionCommand(platform, itemId, editor.getJSON(), text));
    };
  }, [editor, itemId, platform]);
  useEffect(() => () => saveRef.current(), []);

  // Undo/redo (or a change from elsewhere) rewrites the stored description while this field is
  // not being typed in: show it.
  const stored = useLibraryStore((s) => s.items.get(itemId)?.description);
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    const next = (stored as object | null | undefined) ?? emptyNoteBody();
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next);
    }
  }, [stored, editor]);

  return (
    <div
      className="ds-inline-description ds-description-editor"
      data-testid="inline-description"
      onBlur={() => saveRef.current()}
      onClick={() => editor?.commands.focus()}
    >
      {isEmpty && (
        <span aria-hidden className="ds-inline-description__placeholder">
          {en.description.empty}
        </span>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
