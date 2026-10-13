/** Text helpers shared by readers, searchers and formatters. */

/** Splits on \n or \r\n. A trailing newline does not produce an extra empty line. */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** True when the first bytes contain a NUL: the usual sign of a binary file. */
export function looksBinary(head: Uint8Array): boolean {
  return head.includes(0);
}

/** The 1-based inclusive window [start, end] clamped to the file. */
export function clampWindow(
  total: number,
  start: number,
  end: number,
): { start: number; end: number } {
  const first = Math.min(Math.max(1, start), Math.max(1, total));
  return { start: first, end: Math.min(Math.max(first, end), total) };
}

/** Window of `radius` lines on each side of `line`. */
export function windowAround(
  total: number,
  line: number,
  radius: number,
): { start: number; end: number } {
  return clampWindow(total, line - radius, line + radius);
}

/** Extension of a path in lower case, with the dot (".java"), or "" when it has none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** File name of a repo-relative path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** 1-based line number of a character offset. */
export function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

export interface LineMatch {
  readonly groups: readonly (string | undefined)[];
  readonly line: number;
  readonly index: number;
}

/** Every match of a global regex with its 1-based line number; capture groups start at index 1. */
export function matchLines(text: string, regex: RegExp): LineMatch[] {
  const global = regex.flags.includes('g') ? regex : new RegExp(regex.source, `${regex.flags}g`);
  const found: LineMatch[] = [];
  let line = 1;
  let scanned = 0;
  for (const match of text.matchAll(global)) {
    line += countNewlines(text, scanned, match.index);
    scanned = match.index;
    found.push({ groups: [...match], line, index: match.index });
  }
  return found;
}

function countNewlines(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = text.indexOf('\n', from); i !== -1 && i < to; i = text.indexOf('\n', i + 1)) count++;
  return count;
}
