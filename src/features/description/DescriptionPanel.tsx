import { useEffect, useRef } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import { X } from 'lucide-react';
import type { Engine } from '@/canvas/Engine';
import { useCameraState } from '@/canvas/useCameraState';
import type { Platform } from '@/platform/types';
import { Button, IconButton } from '@/design/components';
import { useLibraryStore } from '@/state/libraryStore';
import { useDescriptionStore } from '@/state/descriptionStore';
import { useTermStore } from '@/state/termStore';
import { useUiStore } from '@/state/uiStore';
import { useHistoryStore } from '@/commands/history';
import { createSetDescriptionCommand } from '@/commands/descriptionCommands';
import { noteExtensions, emptyNoteBody } from '@/lib/noteText';
import { en } from '@/i18n/en';
import { useEscape } from '@/app/useEscape';

const MIN_HEIGHT_PX = 240;
const MARGIN_PX = 16;
const GAP_PX = 12;
const ESTIMATED_WIDTH_PX = 400;

const FACETS = [
  { facet: 'type', color: 'var(--criterion-type)' },
  { facet: 'vibe', color: 'var(--criterion-vibe)' },
  { facet: 'movement', color: 'var(--criterion-movement)' },
  { facet: 'tag', color: 'var(--criterion-tags)' },
] as const;

/** The long description of one item (Patch 1 · E3): a panel anchored beside the item, as tall as
 * its card, with a rich-text editor and a read-only summary of its details. One undoable save per
 * editing session (on blur or close). Re-keyed by item id from the wrapper below. */
function DescriptionPanelInner({
  itemId,
  platform,
  engine,
}: {
  itemId: string;
  platform: Platform;
  engine: Engine;
}) {
  const item = useLibraryStore((s) => s.items.get(itemId));
  useLibraryStore((s) => s.placements); // follow the card when it moves or resizes
  useCameraState(engine);
  const terms = useTermStore((s) => s.terms);
  const itemTerms = useTermStore((s) => s.itemTerms.get(itemId));
  const panelRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: noteExtensions,
    content: (item?.description as object | null | undefined) ?? emptyNoteBody(),
    autofocus: 'end',
  });

  // Follow the editor's own state: `useEditor` does not re-render on typing, so without this the
  // placeholder would stay on screen after the first character.
  const isEmpty = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEmpty ?? true,
  });

  // The latest save function, for handlers that outlive a render (blur, unmount, Esc).
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

  const close = () => {
    saveRef.current();
    useDescriptionStore.getState().close();
  };

  useEscape(true, close, { allowWhileTyping: true });

  // Save when the panel goes away for any reason (the bubble closing it, another item opening).
  useEffect(() => () => saveRef.current(), []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest?.('[data-testid="thought-bubble"]')) return; // the bubble toggles it
      if (panelRef.current && !panelRef.current.contains(target)) close();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
    };
  }, []);

  const rect = engine.getScreenRect(itemId);
  if (!item || !rect) return null;

  const onScreen =
    rect.x + rect.w > 0 &&
    rect.y + rect.h > 0 &&
    rect.x < window.innerWidth &&
    rect.y < window.innerHeight;
  const height = Math.max(MIN_HEIGHT_PX, Math.min(rect.h, window.innerHeight - MARGIN_PX * 2));
  const top = Math.max(MARGIN_PX, Math.min(rect.y, window.innerHeight - height - MARGIN_PX));
  const onRight = rect.x + rect.w + GAP_PX + ESTIMATED_WIDTH_PX <= window.innerWidth;

  const grouped = FACETS.map(({ facet, color }) => ({
    color,
    names: [...(itemTerms ?? [])]
      .map((id) => terms.get(id))
      .filter((t) => t?.facet === facet)
      .map((t) => t!.name),
  })).filter((g) => g.names.length > 0);

  function editDetails(): void {
    useLibraryStore.getState().setSelection([itemId]);
    engine.setSelection([itemId]);
    useUiStore.setState({ panelOpen: true, panelTab: 'details' });
    close();
  }

  return (
    <div
      ref={panelRef}
      data-testid="description-panel"
      style={{
        position: 'fixed',
        top,
        height,
        ...(onRight
          ? { left: rect.x + rect.w + GAP_PX }
          : { right: window.innerWidth - rect.x + GAP_PX }),
        width: 'fit-content',
        minWidth: 320,
        maxWidth: 480,
        zIndex: 25,
        display: onScreen ? 'flex' : 'none', // hidden, not closed, while the item is off screen
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 18,
        boxSizing: 'border-box',
        background: 'var(--surface-1)',
        borderRadius: 20,
        boxShadow: 'var(--shadow-float)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <h3
          style={{
            flex: 1,
            margin: 0,
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title.trim() || item.fileName || en.kind[item.kind]}
        </h3>
        <IconButton
          icon={<X size={16} strokeWidth={1.75} />}
          label={en.description.close}
          onClick={close}
        />
      </div>

      <div
        style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto' }}
        className="ds-description-editor"
        onBlur={() => saveRef.current()}
      >
        {isEmpty && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              color: 'var(--text-3)',
            }}
          >
            {en.description.placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>

      <div
        style={{
          borderTop: '1px solid var(--hairline)',
          paddingTop: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {grouped.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {grouped.flatMap((g) =>
              g.names.map((name) => (
                <span
                  key={`${g.color}-${name}`}
                  className="ds-chip"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }}
                  />
                  {name}
                </span>
              )),
            )}
          </div>
        )}
        <Button variant="secondary" onClick={editDetails}>
          {en.description.editDetails}
        </Button>
      </div>
    </div>
  );
}

/** Mounted once in the app shell; renders nothing unless a description panel is open. */
export function DescriptionPanel({
  platform,
  engine,
}: {
  platform: Platform;
  engine: Engine | null;
}) {
  const itemId = useDescriptionStore((s) => s.itemId);
  if (!itemId || !engine) return null;
  return <DescriptionPanelInner key={itemId} itemId={itemId} platform={platform} engine={engine} />;
}
