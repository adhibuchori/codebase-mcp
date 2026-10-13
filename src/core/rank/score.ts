/**
 * Match scoring, after Zoekt: a whole-word hit outranks a partial one (500 vs 50), a hit on a
 * symbol definition outranks both (7,000), a file whose name carries the query gets a bonus, and
 * tests, vendored and generated files are divided by 5 (docs by 2).
 */
import type { TextMatch } from '../model/domain.types.ts';
import { FLAG_DOCS, FLAG_GENERATED, FLAG_TEST, FLAG_VENDOR } from './classify.ts';

export interface ScoreContext {
  /** The text that was searched for, lower-cased; "" for a regex. */
  readonly needle: string;
  /** Lines (1-based) in this file that define a symbol named like the needle. */
  readonly definitionLines: ReadonlySet<number>;
  readonly flags: number;
}

const WORD = /[A-Za-z0-9_$]/;

/** True when the match at `column` (1-based) is not glued to identifier characters on either side. */
export function isWholeWord(text: string, column: number, length: number): boolean {
  const before = text[column - 2] ?? ' ';
  const after = text[column - 1 + length] ?? ' ';
  return !WORD.test(before) && !WORD.test(after);
}

export function penaltyFor(flags: number): number {
  if (flags & (FLAG_TEST | FLAG_VENDOR | FLAG_GENERATED)) return 0.2;
  return flags & FLAG_DOCS ? 0.5 : 1;
}

export function scoreMatch(match: TextMatch, context: ScoreContext): number {
  const length = context.needle.length;
  let score = length > 0 && isWholeWord(match.text, match.column, length) ? 500 : 50;
  if (context.definitionLines.has(match.line)) score += 7000;
  const base = match.path.slice(match.path.lastIndexOf('/') + 1).toLowerCase();
  if (length > 0 && base.includes(context.needle)) score += 300;
  return score * penaltyFor(context.flags);
}

/** A file's score: its best match plus a small bonus for how many matches it has. */
export function scoreFile(matchScores: readonly number[]): number {
  const best = matchScores.reduce((max, value) => Math.max(max, value), 0);
  return best + 10 * Math.log2(1 + matchScores.length);
}
