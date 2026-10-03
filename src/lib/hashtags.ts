/** A hashtag starts at the start of the text, after whitespace or "(", is "#" + a letter or digit,
 * then letters, digits, "_" or "-". The `u` flag makes accents count as letters (#rêve). Capture
 * group 1 is the character before the "#", group 2 the tag without it. */
export const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

const MAX_LINE = 160;

/** Lower-cased, unique hashtags (without "#"), in order of appearance. */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) seen.add(m[2].toLowerCase());
  return [...seen];
}

/** Each hashtag occurrence with the (trimmed, at most 160 characters) line of text it sits in. */
export function hashtagLines(text: string): { tag: string; line: string }[] {
  const out: { tag: string; line: string }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    for (const tag of extractHashtags(line)) {
      out.push({ tag, line: line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line });
    }
  }
  return out;
}
