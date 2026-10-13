/**
 * Validation for every value a user can pass to git. The reference git MCP server had argument
 * injection CVEs (an `--output=` revision, paths outside the repo); here a value is checked before it
 * ever reaches the command line, and the adapter adds --end-of-options as a second layer.
 */
import { ToolError } from '../errors/tool-error.ts';

const REVISION = /^[A-Za-z0-9][A-Za-z0-9._/@{}~^-]{0,199}$/;

/** A branch, tag, sha or relative ref like HEAD~3. Never an option, never a range with spaces. */
export function validateRevision(rev: string): string {
  const value = rev.trim();
  if (!REVISION.test(value) || value.includes('..')) {
    throw new ToolError(
      `"${rev}" is not a valid revision.`,
      'Use a commit sha, a branch or tag name, or HEAD~N.',
    );
  }
  return value;
}

const SINCE = /^(\d{4}-\d{2}-\d{2}|\d{1,3}\s+(day|days|week|weeks|month|months|year|years))$/;

/** A --since value: an ISO date or "N days|weeks|months|years". */
export function validateSince(since: string): string {
  const value = since.trim().toLowerCase();
  if (!SINCE.test(value)) {
    throw new ToolError(
      `"${since}" is not a supported date.`,
      'Use YYYY-MM-DD or a span like "14 days".',
    );
  }
  return value.includes(' ') ? `${value.replace(/\s+/, '.')}.ago` : value;
}

/** Text for -S/-G: one argument, attached to its flag, so it can never be read as an option. */
export function validatePickaxe(text: string): string {
  if (text.length === 0 || text.length > 200 || /[\0\n\r]/.test(text)) {
    throw new ToolError('The search text must be 1-200 characters on one line.');
  }
  return text;
}

/** "120" or "120-180" to a 1-based inclusive range of at most `max` lines. */
export function parseLineRange(spec: string, max: number): { start: number; end: number } {
  const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(spec);
  if (!match) throw new ToolError(`"${spec}" is not a line range.`, 'Use "120" or "120-180".');
  const start = Math.max(1, Number(match[1]));
  const end = Math.max(start, Number(match[2] ?? match[1]));
  return { start, end: Math.min(end, start + max - 1) };
}
