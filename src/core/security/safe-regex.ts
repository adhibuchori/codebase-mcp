/**
 * Regex guard for the JavaScript fallback. ripgrep's engine runs in linear time, so any pattern is
 * safe there; JavaScript's backtracking engine is not, and one pathological pattern would stall the
 * whole server. When ripgrep is unavailable, a user regex must pass this check first.
 */
import { ToolError } from '../errors/tool-error.ts';

const MAX_PATTERN = 300;

/** A quantified group that itself contains a quantifier or an alternation: (a+)+, (a|aa)*, (\w*){2,}. */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*(?:[+*}]|\|)(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;

/** Back-references make matching exponential in the worst case. */
const BACKREFERENCE = /\\[1-9]|\\k</;

export function assertSafeRegex(pattern: string): void {
  if (pattern.length > MAX_PATTERN) {
    throw new ToolError(
      `The regex is longer than ${MAX_PATTERN} characters.`,
      'Shorten it, or search literally.',
    );
  }
  if (NESTED_QUANTIFIER.test(pattern) || BACKREFERENCE.test(pattern)) {
    throw new ToolError(
      'This regex could take exponential time without ripgrep (nested quantifiers or back-references).',
      'Simplify the pattern, search literally, or install ripgrep (see bun run doctor).',
    );
  }
}

/** Compiles a user regex, turning a syntax error into a ToolError the model can fix. */
export function compileRegex(pattern: string, flags: string): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ToolError(
      `Invalid regex: ${reason}`,
      'Escape special characters, or use mode "literal".',
    );
  }
}

/** Escapes text for use inside a RegExp. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
