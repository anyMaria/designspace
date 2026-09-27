import { useEffect, useState } from 'react';
import type { Engine } from '@/canvas/Engine';
import type { Platform } from '@/platform/types';
import { importFiles } from './importItems';

/** Drag-and-drop onto the canvas and Ctrl+V anywhere (§2.3). Files land at the drop point;
 * a paste with no cursor position lands at the viewport center. Listens on `window` rather than
 * the canvas element, since the dock/panels sit as siblings above it and a drop over them should
 * still count. */
export function useDropAndPaste(engine: Engine | null, platform: Platform): { dragOver: boolean } {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let dragDepth = 0;

    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragDepth++;
      setDragOver(true);
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    }
    function onDragLeave() {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragOver(false);
    }
    function onDrop(e: DragEvent) {
      dragDepth = 0;
      setDragOver(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      const point = engine?.screenToWorld(e.clientX, e.clientY) ?? engine?.viewportCenter() ?? { x: 0, y: 0 };
      void importFiles(platform, Array.from(files), point, (rect) => engine?.flyTo(rect));
    }

    async function onPaste(e: ClipboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
      }
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
