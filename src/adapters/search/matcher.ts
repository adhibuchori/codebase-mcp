/**
 * Line matchers for the JavaScript searcher: literal (indexOf), word (a \b-bounded literal) or
 * regex. Without ripgrep a user regex runs on JavaScript's backtracking engine, so it must pass the
 * safe-regex guard first.
 */
import { assertSafeRegex, compileRegex, escapeRegex } from '../../core/security/safe-regex.ts';
import type { TextQuery } from '../../ports/search.ts';

/** Returns the 1-based column of the first match in a line, or 0. */
export type LineMatcher = (line: string) => number;

function literalMatcher(pattern: string, caseSensitive: boolean): LineMatcher {
  if (caseSensitive) return (line) => line.indexOf(pattern) + 1;
  const needle = pattern.toLowerCase();
  return (line) => line.toLowerCase().indexOf(needle) + 1;
}

function regexMatcher(regex: RegExp): LineMatcher {
  return (line) => {
    regex.lastIndex = 0;
    const match = regex.exec(line);
    return match ? match.index + 1 : 0;
  };
}

export function compileMatcher(
  query: Pick<TextQuery, 'pattern' | 'mode' | 'caseSensitive'>,
): LineMatcher {
  const flags = query.caseSensitive ? 'u' : 'iu';
  if (query.mode === 'literal') return literalMatcher(query.pattern, query.caseSensitive);
  if (query.mode === 'word')
    return regexMatcher(compileRegex(`(?<![\\w$])${escapeRegex(query.pattern)}(?![\\w$])`, flags));
  assertSafeRegex(query.pattern);
  return regexMatcher(compileRegex(query.pattern, flags));
}

/** Smart case: case-sensitive only when the pattern has an upper-case letter. */
export function smartCase(pattern: string): boolean {
  return /[A-Z]/.test(pattern);
}
