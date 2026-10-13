/**
 * Source helpers for the C# extractors. Comments are blanked so that commented-out code never
 * yields a route, and a second copy also blanks string literals (regular, verbatim, interpolated and
 * raw) and chars, so that a bracket inside a literal such as "api/[controller]" never derails a scan.
 * Both copies keep every offset and newline of the original.
 */

/** The source with comments blanked (`code`), and with comments and literals blanked (`bare`). */
export interface MaskedSource {
  readonly code: string;
  readonly bare: string;
  /** For each `(`, `[` and `{` in `bare`, the index of the bracket that closes it. */
  readonly closers: ReadonlyMap<number, number>;
}

const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|\${0,4}"""[\s\S]*?(?:"""|$)|(?:\$@|@\$?)"(?:[^"]|"")*"?|\$?"(?:[^"\\\n]|\\.)*"?|'(?:\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,4}|.)|[^\\'\n])'/g;
const LITERAL = /"([^"\n]*)"/g;
const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
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

/** Index of the bracket closing the one at `open` in a bare line, or -1 when it stays open. */
export function closingBracket(bare: string, open: number): number {
  const opener = bare.charAt(open);
  const closer = PAIRS[opener];
  if (!closer) return -1;
  let depth = 0;
  for (let i = open; i < bare.length; i++) {
    const char = bare.charAt(i);
    if (char === opener) depth += 1;
    else if (char === closer) depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

/** The first argument of the call whose `(` sits at `open`, as written; "" when it never closes. */
export function firstArgument(source: MaskedSource, open: number): string {
  const close = source.closers.get(open);
  if (close === undefined) return '';
  const bare = source.bare.slice(open + 1, close);
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const char = bare.charAt(i);
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) return source.code.slice(open + 1, open + 1 + i).trim();
  }
  return source.code.slice(open + 1, close).trim();
}

/** The string literals in an expression, or the expression itself when it holds none. */
export function valuesOf(expression: string): string[] {
  const literals = [...expression.matchAll(LITERAL)].map((match) => match[1] ?? '');
  if (literals.length > 0) return literals;
  return expression ? [expression] : [];
}
