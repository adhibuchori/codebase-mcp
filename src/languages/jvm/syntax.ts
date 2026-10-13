/**
 * Source helpers shared by the JVM extractors (Java, Kotlin, Scala). Comments are blanked so that
 * commented-out code never yields a route, and a second copy also blanks string and char literals so
 * that a bracket or an `@` inside a literal never derails a scan. Both copies keep every offset and
 * newline of the original, so a position found in one reads the same text in the other.
 */
import { matchLines, type LineMatch } from '../../core/text/lines.ts';

/** The source with comments blanked (`code`), and with comments and literals blanked (`bare`). */
export interface MaskedSource {
  readonly code: string;
  readonly bare: string;
  /** For each `(`, `[` and `{` in `bare`, the index of the bracket that closes it. */
  readonly closers: ReadonlyMap<number, number>;
}

/** The text between a pair of parentheses in both copies, and the index just after the `)`. */
export interface Arguments {
  readonly code: string;
  readonly bare: string;
  readonly end: number;
}

/** One argument: `name = value`, or a positional value with name "". */
export interface Argument {
  readonly name: string;
  readonly value: string;
}

export interface Annotation {
  /** Simple name: `@org.springframework.web.bind.annotation.GetMapping` gives "GetMapping". */
  readonly name: string;
  readonly line: number;
  readonly start: number;
  /** Index just after the annotation, past its closing parenthesis when it has arguments. */
  readonly end: number;
  /** The argument text as written, "" without arguments. */
  readonly text: string;
  readonly args: readonly Argument[];
}

/** A comment, a text block, a string or a char literal: the tokens a lexer would skip. */
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"""[\s\S]*?(?:"""|$)|"(?:[^"\\\n]|\\.)*"?|'(?:\\(?:u[0-9a-fA-F]{4}|.)|[^\\'\n])'/g;
const LITERAL = /"((?:[^"\\\n]|\\.)*)"/g;
const ANNOTATION = /@([A-Za-z_][\w.]*)/g;
const NAMED = /^\s*([A-Za-z_]\w*)\s*=(?!=)/;
const OPEN_PAREN = /^[ \t]*\(/;
const BRACKET = /[()[\]{}]/g;
const OPENER_OF: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

const blank = (token: string): string => token.replace(/[^\n]/g, ' ');
const isComment = (token: string): boolean => token.startsWith('//') || token.startsWith('/*');
const unescape = (literal: string): string => literal.replace(/\\(.)/g, '$1');

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

/** The arguments of the call or annotation whose `(` sits at `open`; null when it never closes. */
export function argumentsAt(source: MaskedSource, open: number): Arguments | null {
  const close = source.closers.get(open);
  if (close === undefined) return null;
  return {
    code: source.code.slice(open + 1, close),
    bare: source.bare.slice(open + 1, close),
    end: close + 1,
  };
}

function topLevelCommas(bare: string): number[] {
  const commas: number[] = [];
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const char = bare.charAt(i);
    if (OPENERS.has(char)) depth += 1;
    else if (CLOSERS.has(char)) depth -= 1;
    else if (char === ',' && depth === 0) commas.push(i);
  }
  return commas;
}

/** Splits an argument list on its top-level commas; `{"/a", "/b"}` stays one argument. */
export function splitArguments(args: Arguments): Argument[] {
  const bounds = [-1, ...topLevelCommas(args.bare), args.bare.length];
  const parts: Argument[] = [];
  for (let k = 1; k < bounds.length; k++) {
    const from = (bounds[k - 1] ?? 0) + 1;
    const to = bounds[k] ?? from;
    const named = NAMED.exec(args.bare.slice(from, to));
    const value = args.code.slice(from + (named?.[0].length ?? 0), to);
    if (named || value.trim()) parts.push({ name: named?.[1] ?? '', value });
  }
  return parts;
}

/** The string literals in a value, or the expression itself (a constant, a property) without one. */
export function valuesOf(value: string): string[] {
  const literals = [...value.matchAll(LITERAL)].map((match) => unescape(match[1] ?? ''));
  if (literals.length > 0) return literals;
  const expression = value.trim();
  return expression ? [expression] : [];
}

/** Values of the first attribute in `names` that is set; positional arguments count as `value`. */
export function attributeValues(args: readonly Argument[], names: readonly string[]): string[] {
  for (const name of names) {
    const set = args.filter((arg) => arg.name === name || (name === 'value' && arg.name === ''));
    if (set.length > 0) return set.flatMap((arg) => valuesOf(arg.value));
  }
  return [];
}

function readAnnotation(source: MaskedSource, match: LineMatch): Annotation {
  const qualified = match.groups[1] ?? '';
  const nameEnd = match.index + 1 + qualified.length;
  const paren = OPEN_PAREN.exec(source.bare.slice(nameEnd, nameEnd + 16));
  const args = paren ? argumentsAt(source, nameEnd + paren[0].length - 1) : null;
  return {
    name: qualified.slice(qualified.lastIndexOf('.') + 1),
    line: match.line,
    start: match.index,
    end: args?.end ?? nameEnd,
    text: args?.code ?? '',
    args: args ? splitArguments(args) : [],
  };
}

/** Every annotation outside comments and literals, in order; ones nested in arguments are skipped. */
export function annotationsIn(source: MaskedSource): Annotation[] {
  const found: Annotation[] = [];
  for (const match of matchLines(source.bare, ANNOTATION)) {
    if (match.index >= (found.at(-1)?.end ?? 0)) found.push(readAnnotation(source, match));
  }
  return found;
}
