import { HASHTAG_RE } from './hashtags';

interface Node {
  type?: string;
  text?: string;
  attrs?: { level?: number; start?: number };
  marks?: { type: string }[];
  content?: Node[];
}

function wrapHashtags(text: string): string {
  return text.replace(
    HASHTAG_RE,
    (_m, before: string, tag: string) => `${before}<dshash>#${tag}</dshash>`,
  );
}

function inline(node: Node): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type !== 'text' || typeof node.text !== 'string')
    return (node.content ?? []).map(inline).join('');
  let out = wrapHashtags(node.text);
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = `<b>${out}</b>`;
    else if (mark.type === 'italic') out = `<i>${out}</i>`;
  }
  return out;
}

function lines(node: Node, prefix = ''): string[] {
  switch (node.type) {
    case 'paragraph':
      return [prefix + (node.content ?? []).map(inline).join('')];
    case 'heading':
      return [`${prefix}<b>${(node.content ?? []).map(inline).join('')}</b>`];
    case 'bulletList':
      return (node.content ?? []).flatMap((li) => itemLines(li, '• '));
    case 'orderedList': {
      const start = node.attrs?.start ?? 1;
      return (node.content ?? []).flatMap((li, i) => itemLines(li, `${start + i}. `));
    }
    case 'blockquote':
    case 'doc':
      return (node.content ?? []).flatMap((c) => lines(c, prefix));
    case 'codeBlock':
      return (node.content ?? []).map((c) => prefix + (c.text ?? ''));
    default:
      return (node.content ?? []).flatMap((c) => lines(c, prefix));
  }
}

function itemLines(li: Node, bullet: string): string[] {
  const out = (li.content ?? []).flatMap((c) => lines(c));
  if (out.length === 0) return [bullet.trimEnd()];
  return out.map((l, i) => (i === 0 ? bullet + l : '   ' + l));
}

/** TipTap JSON → text for the canvas label (Patch 1 · D1): `<b>`/`<i>` around bold/italic, headings
 * as bold lines, "• " and "1. " list prefixes, and every hashtag wrapped in `<dshash>`. Pixi only
 * parses tags that exist in `tagStyles`, so anything else stays literal. A malformed body gives ''. */
export function noteBodyToTaggedText(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  try {
    return lines(body).join('\n').replace(/\n+$/, '');
  } catch {
    return '';
  }
}
