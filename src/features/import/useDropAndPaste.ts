import { useEffect, useState } from 'react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { importFiles } from './importItems';
import { importLink } from './importLink';
import { useBoardStore } from '@/state/boardStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useHistoryStore } from '@/commands/history';
import { createCreateNoteCommand } from '@/commands/noteCommands';
import { parseHttpUrl } from '@/lib/urlDetect';

/** Something worth showing the "Drop to add" overlay for — real files, or a URL dragged from a
 * browser tab/address bar (`text/uri-list`; some browsers also/instead put it on `text/plain`,
 * which the overlay accepts too and `onDrop` validates for real once the actual text is
 * readable). */
function isDroppableDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return (
    dataTransfer.types.includes('Files') ||
    dataTransfer.types.includes('text/uri-list') ||
    dataTransfer.types.includes('text/plain')
  );
}

/** Drag-and-drop onto the canvas and Ctrl+V anywhere (§2.3). Files/links land at the drop point;
 * a paste with no cursor position lands at the viewport center. Listens on `window` rather than
 * the canvas element, since the dock/panels sit as siblings above it and a drop over them should
 * still count. */
export function useDropAndPaste(engine: Engine | null, platform: Platform): { dragOver: boolean } {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let dragDepth = 0;

    function onDragEnter(e: DragEvent) {
      if (!isDroppableDrag(e.dataTransfer)) return;
      dragDepth++;
      setDragOver(true);
    }
    function onDragOver(e: DragEvent) {
      if (!isDroppableDrag(e.dataTransfer)) return;
      e.preventDefault();
    }
    function onDragLeave() {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragOver(false);
    }
    function onDrop(e: DragEvent) {
      dragDepth = 0;
      setDragOver(false);
      const point = engine?.screenToWorld(e.clientX, e.clientY) ??
        engine?.viewportCenter() ?? { x: 0, y: 0 };

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        void importFiles(platform, Array.from(files), point, (rect) => engine?.flyTo(rect));
        return;
      }

      // A link dragged from a browser tab/address bar/page — text/uri-list is the standard slot
      // for this; text/plain is a fallback some browsers use instead.
      const dropped =
        e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
      const url = dropped ? parseHttpUrl(dropped) : null;
      if (url) {
        e.preventDefault();
        void importLink(platform, url.toString(), point, useSettingsStore.getState().offlineMode);
      }
    }

    async function onPaste(e: ClipboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const point = engine?.viewportCenter() ?? { x: 0, y: 0 };

      const fileItems = Array.from(e.clipboardData?.files ?? []);
      if (fileItems.length > 0) {
        void importFiles(platform, fileItems, point, (rect) => engine?.flyTo(rect));
        return;
      }

      const bytes = await platform.clipboard.readImage();
      if (bytes) {
        const file = new File([bytes.slice()], `pasted-${Date.now()}.png`, { type: 'image/png' });
        void importFiles(platform, [file], point, (rect) => engine?.flyTo(rect));
        return;
      }

      // §2.3 "URLs (→ Link, or an image if the URL points to one)" / §2.11 "Pasted text becomes a
      // note" — only once neither a file nor an image is on the clipboard, so pasting a copied
      // *image* (bytes above) never also drops a text note of its alt text or whatever else
      // browsers sometimes put on the text/plain slot alongside it. A URL takes priority over the
      // plain-text-becomes-a-note fallback; `importLink` itself handles the image-URL case.
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;

      const url = parseHttpUrl(text);
      if (url) {
        void importLink(platform, url.toString(), point, useSettingsStore.getState().offlineMode);
        return;
      }

      const boardId = useBoardStore.getState().currentBoardId;
      if (!boardId) return;
      const board = useBoardStore.getState().boards.get(boardId);
      const isLibraryBoard = board?.kind === 'library';
      const { command } = createCreateNoteCommand(
        platform,
        boardId,
        isLibraryBoard,
        point.x,
        point.y,
        text,
        'cream',
      );
      void useHistoryStore.getState().execute(command);
    }

    const handlePaste = (e: ClipboardEvent) => void onPaste(e);

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }, [engine, platform]);

  return { dragOver };
}
