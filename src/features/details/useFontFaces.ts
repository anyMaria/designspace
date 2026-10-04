import { useEffect, useState } from 'react';
import type { Platform } from '@/platform/types';
import type { FontFile } from '@/state/types';
import { registerFontFace, weightDescriptors } from '@/lib/fontRender';

/** The CSS family a file of this item is registered under (never several files under one name). */
export const fileFamily = (itemId: string, file: FontFile): string =>
  `${itemId}-${file.sort}-${file.id}`;

/** Registers one `FontFace` per file so a Styles row can be written in its own style. */
export function useFontFaces(platform: Platform, itemId: string, files: FontFile[]): boolean {
  const [ready, setReady] = useState<string>('');
  const signature = files.map((f) => f.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const faces: FontFace[] = [];
    void (async () => {
      for (const f of files) {
        try {
          const res = await fetch(platform.media.originalUrl(f.filePath));
          if (!res.ok) continue;
          const bytes = await res.arrayBuffer();
          const face = await registerFontFace(
            bytes,
            fileFamily(itemId, f),
            weightDescriptors({ variableAxes: f.axes ?? [] }),
          );
          if (cancelled) document.fonts.delete(face);
          else faces.push(face);
        } catch {
          // an unreadable file keeps the default look
        }
      }
      if (!cancelled) setReady(signature);
    })();
    return () => {
      cancelled = true;
      for (const face of faces) document.fonts.delete(face);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the file set changes
  }, [platform, itemId, signature]);
  return ready === signature;
}
