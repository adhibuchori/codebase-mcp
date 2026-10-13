/**
 * Source helpers for the Go extractors. Comments are blanked so that commented-out code never yields
 * a route, and a second copy also blanks string, raw string and rune literals so that a brace inside
 * a literal never moves the brace depth. Both copies keep every offset and newline of the original.
 */

/** The source with comments blanked (`code`), and with comments and literals blanked (`bare`). */
export interface MaskedSource {
  readonly code: string;
  readonly bare: string;
  /** For each `(`, `[` and `{` in `bare`, the index of the bracket that closes it. */
  readonly closers: ReadonlyMap<number, number>;
}

const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|`[^`]*`?|"(?:[^"\\\n]|\\.)*"?|'(?:\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{3}|.)|[^\\'\n])'/g;
const IDENTIFIER = /^\w+$/;
const BRACKET = /[()[\]{}]/g;
const OPENER_OF: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

const blank = (token: string): string => token.replace(/[^\n]/g, ' ');
const isComment = (token: string): boolean => token.startsWith('//') || token.startsWith('/*');

/** Pairs every bracket with its closer in one pass; each kind of bracket nests on its own. */
function pairBrackets(bare: string): Map<number, number> {
  const closers = new Map<number, number>();
  const open = new Map<string, number[]>([
    ['(', []],
    ['[', []],
    ['{', []],
  ]);
  for (const match of bare.matchAll(BRACKET)) {
    const opener = OPENER_OF[match[0]];
    const start = opener ? open.get(opener)?.pop() : undefined;
    if (!opener) open.get(match[0])?.push(match.index);
    else if (start !== undefined) closers.set(start, match.index);
  }
  return closers;
}

export function maskSource(text: string): MaskedSource {
  const bare = text.replace(TOKEN, blank);
  return {
    code: text.replace(TOKEN, (token) => (isComment(token) ? blank(token) : token)),
    bare,
    closers: pairBrackets(bare),
  };
}

/** `{` count minus `}` count of a line whose literals are blanked. */
export function braceDelta(bare: string): number {
  let delta = 0;
  for (const char of bare) {
    if (char === '{') delta += 1;
    else if (char === '}') delta -= 1;
  }
  return delta;
}

/**
 * A value as the source wrote it: a string literal's content, or the literal a plain identifier is
 * assigned in the same file (`const ordersTopic = "orders"`, `topic := "orders"`), or else the
 * expression itself without a leading `&`.
 */
export function goValue(code: string, expression: string): string {
  const value = expression.trim().replace(/^&/, '');
  if (value.startsWith('"')) return value.slice(1, -1);
  if (!IDENTIFIER.test(value)) return value;
  const assigned = new RegExp(`\\b${value}\\s*(?:string\\s*)?:?=\\s*"([^"\\n]*)"`).exec(code);
  return assigned?.[1] ?? value;
}
