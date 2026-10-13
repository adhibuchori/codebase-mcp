/**
 * Small readers over source text that the route extractors of several languages share. A route or
 * a client call is found by a regex that ends at its opening parenthesis; its arguments are then
 * cut out by counting parentheses, because options such as `method:` or `topic:` may sit several
 * lines below the call, which no single line-safe regex can reach.
 */
import { matchLines, type LineMatch } from '../../core/text/lines.ts';

/** A line that is a `//` comment, or a line of a block comment (JSDoc), up to the match. */
export const C_STYLE_COMMENT = /^\s*(?:\/\/|\/?\*)/;
/** A `#` comment line (Python, Ruby). */
export const HASH_COMMENT = /^\s*#/;
/** A PHP `//` or `#` comment line; not a `#[…]` attribute, and not a docblock (annotations live there). */
export const PHP_COMMENT = /^\s*(?:\/\/|#(?!\[))/;

const MAX_CALL_LENGTH = 4000;
const MAX_PREFIX_LENGTH = 120;
const OPEN_PAREN = 40;
const CLOSE_PAREN = 41;
const QUOTED = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;
/** A leading string literal, after an optional Python prefix (r"…", f"…", rb"…"). */
const LEADING_QUOTED = /^\s*[rRfFbBuU]{0,2}(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`)/;

/** The text inside the call whose opening parenthesis is at `open`, at most 4000 characters. */
export function callArgs(text: string, open: number): string {
  const end = Math.min(text.length, open + MAX_CALL_LENGTH);
  let depth = 0;
  for (let i = open; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === OPEN_PAREN) depth += 1;
    else if (code === CLOSE_PAREN) depth -= 1;
    if (depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1, end);
}

/** The arguments of the call whose opening parenthesis is the last character of the match. */
export function argsOfCall(text: string, match: LineMatch): string {
  return callArgs(text, match.index + (match.groups[0]?.length ?? 1) - 1);
}

/** The contents of every quoted string in the text, in order. */
export function quotedStrings(text: string): string[] {
  return [...text.matchAll(QUOTED)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

/** The contents of the string literal the text starts with, or undefined when it starts otherwise. */
export function leadingString(text: string): string | undefined {
  const match = LEADING_QUOTED.exec(text);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : undefined;
}

/** The text before `index` on its line, at most 120 characters: what a call is used by. */
export function linePrefix(text: string, index: number): string {
  const window = text.slice(Math.max(0, index - MAX_PREFIX_LENGTH), index);
  return window.slice(window.lastIndexOf('\n') + 1);
}

/**
 * Every match of the regex except those on a commented-out line, so dead code yields no route.
 * Line starts are tracked forward across the matches, which keeps a long line linear.
 */
export function codeMatches(text: string, regex: RegExp, comment: RegExp): LineMatch[] {
  let lineStart = 0;
  let scanned = 0;
  return matchLines(text, regex).filter((match) => {
    for (
      let at = text.indexOf('\n', scanned);
      at !== -1 && at < match.index;
      at = text.indexOf('\n', at + 1)
    ) {
      lineStart = at + 1;
    }
    scanned = match.index;
    return !comment.test(text.slice(lineStart, match.index));
  });
}
