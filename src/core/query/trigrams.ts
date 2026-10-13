/**
 * Index prefilter. The content index stores trigrams per file (SQLite FTS5, trigram tokenizer,
 * detail=none). A file can only contain a literal if it contains every trigram of it, so ANDing the
 * trigrams gives a small candidate set that the searcher then verifies, as Google Code Search did.
 */

/** Distinct lower-case trigrams of a literal; empty when it is shorter than three characters. */
export function trigramsOf(literal: string): string[] {
  const text = literal.toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= text.length; i++) grams.add(text.slice(i, i + 3));
  return [...grams];
}

/** FTS5 MATCH expression ANDing the trigrams of every literal, or "" when none is long enough. */
export function trigramMatch(literals: readonly string[]): string {
  const grams = new Set<string>();
  for (const literal of literals) for (const gram of trigramsOf(literal)) grams.add(gram);
  return [...grams].map((gram) => `"${gram.replaceAll('"', '""')}"`).join(' AND ');
}

interface Step {
  readonly literal: string | null;
  readonly end: number;
}

/** One atom of a regex: a literal character, or null for anything that is not one. */
function readAtom(pattern: string, at: number): Step {
  const char = pattern[at] ?? '';
  if (char === '\\') {
    const next = pattern[at + 1] ?? '';
    return { literal: /[^A-Za-z0-9]/.test(next) ? next : null, end: at + 2 };
  }
  if (char === '[') return { literal: null, end: skipClass(pattern, at) };
  if (char === '(') return { literal: null, end: skipGroup(pattern, at) };
  return { literal: '.^$'.includes(char) ? null : char, end: at + 1 };
}

function skipClass(pattern: string, at: number): number {
  let i = at + 1;
  while (i < pattern.length && pattern[i] !== ']') i += pattern[i] === '\\' ? 2 : 1;
  return i + 1;
}

function skipGroup(pattern: string, at: number): number {
  let depth = 0;
  let i = at;
  for (; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') i++;
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) break;
  }
  return i + 1;
}

type Quantifier = 'none' | 'optional' | 'repeat';

/** The bare quantifier at `at`, without a lazy or possessive suffix. */
function quantifierAt(pattern: string, at: number): { kind: Quantifier; end: number } {
  const char = pattern[at] ?? '';
  if (char === '?' || char === '*') return { kind: 'optional', end: at + 1 };
  if (char === '+') return { kind: 'repeat', end: at + 1 };
  const brace = char === '{' ? /^\{(\d+)(?:,\d*)?\}/.exec(pattern.slice(at)) : null;
  if (!brace) return { kind: 'none', end: at };
  return { kind: brace[1] === '0' ? 'optional' : 'repeat', end: at + brace[0].length };
}

/** The quantifier after an atom: none, optional (?, *, {0,…}) or repeat (+, {n,…} with n ≥ 1). */
function readQuantifier(pattern: string, at: number): { kind: Quantifier; end: number } {
  const found = quantifierAt(pattern, at);
  const lazy = found.kind !== 'none' && '?+'.includes(pattern[found.end] ?? 'x');
  return lazy ? { kind: found.kind, end: found.end + 1 } : found;
}

/**
 * Literal runs every match of a regex must contain, for the prefilter. Conservative: an alternation
 * returns [], and a class, a group or an optional atom ends a run.
 */
export function requiredLiterals(pattern: string): string[] {
  if (pattern.includes('|')) return [];
  const runs: string[] = [];
  let current = '';
  let i = 0;
  while (i < pattern.length) {
    const atom = readAtom(pattern, i);
    const quantifier = readQuantifier(pattern, atom.end);
    if (atom.literal === null || quantifier.kind === 'optional') {
      current = flush(runs, current);
    } else if (quantifier.kind === 'repeat') {
      flush(runs, current + atom.literal);
      current = atom.literal;
    } else {
      current += atom.literal;
    }
    i = quantifier.end;
  }
  flush(runs, current);
  return runs;
}

function flush(runs: string[], current: string): string {
  if (current.length >= 3) runs.push(current);
  return '';
}
