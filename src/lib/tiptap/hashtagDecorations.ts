import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { HASHTAG_RE } from '@/lib/hashtags';

/** Positions of every hashtag in a document: `[from, to]` in ProseMirror positions. */
export function hashtagRanges(doc: PMNode): [number, number][] {
  const ranges: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(HASHTAG_RE)) {
      const start = pos + (m.index ?? 0) + m[1].length;
      ranges.push([start, start + 1 + m[2].length]);
    }
  });
  return ranges;
}

/** Marks hashtags while typing (Patch 1 · D2) with `.ds-hashtag`: bold and the hashtag colour, no
 * background or padding, so the editor looks exactly like the canvas label. */
export const HashtagDecorations = Extension.create({
  name: 'hashtagDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('hashtagDecorations'),
        props: {
          decorations(state) {
            return DecorationSet.create(
              state.doc,
              hashtagRanges(state.doc).map(([from, to]) =>
                Decoration.inline(from, to, { class: 'ds-hashtag' }),
              ),
            );
          },
        },
      }),
    ];
  },
});
