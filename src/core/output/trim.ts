/**
 * Line shaping for search results: long or minified lines are cut to a window around the match,
 * and indentation is dropped, so one hit costs a handful of tokens.
 */
const ELLIPSIS = '…';

/** A window of at most `max` characters around the 1-based match column. */
export function trimLine(text: string, column: number, max = 160): string {
  const line = text.replace(/\s+$/, '');
  const leading = line.length - line.trimStart().length;
  const body = line.trimStart();
  if (body.length <= max) return body;
  const center = Math.max(0, column - 1 - leading);
  const start = Math.max(0, Math.min(center - Math.floor(max / 3), body.length - max));
  const end = start + max;
  return `${start > 0 ? ELLIPSIS : ''}${body.slice(start, end)}${end < body.length ? ELLIPSIS : ''}`;
}

/** Numbered lines, right-aligned so the code column lines up: "  98: code". */
export function numberLines(lines: readonly string[], firstLine: number): string[] {
  const width = String(firstLine + lines.length - 1).length;
  return lines.map((text, index) => `${String(firstLine + index).padStart(width)}: ${text}`);
}

/** Pluralised count: "1 file", "3 files", "2 matches". */
export function plural(count: number, noun: string): string {
  if (count === 1) return `${count} ${noun}`;
  return `${count.toLocaleString('en-US')} ${noun}${/(s|sh|ch|x)$/.test(noun) ? 'es' : 's'}`;
}
