/**
 * The one error shape tools report back to the model: a message it can act on, plus a hint for the
 * next call. Anything else is an internal error, reported without paths or stacks.
 */
export class ToolError extends Error {
  readonly hint: string;

  constructor(message: string, hint = '') {
    super(message);
    this.name = 'ToolError';
    this.hint = hint;
  }
}

const INTERNAL = 'Internal error while running the tool. The server log has the details.';

/** Text for the model. A ToolError keeps its message and hint; any other error stays generic. */
export function describeError(error: unknown): string {
  if (!(error instanceof ToolError)) return INTERNAL;
  return error.hint ? `${error.message}\nHint: ${error.hint}` : error.message;
}

/** "Did you mean" for an unknown name, from the closest known names by shared prefix and length. */
export function suggest(name: string, known: readonly string[], max = 5): string[] {
  const wanted = name.toLowerCase();
  const scored = known.map((candidate) => ({
    candidate,
    score: similarity(wanted, candidate.toLowerCase()),
  }));
  return scored
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, max)
    .map((entry) => entry.candidate);
}

function similarity(a: string, b: string): number {
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 50 - Math.abs(a.length - b.length);
  let prefix = 0;
  while (prefix < a.length && a[prefix] === b[prefix]) prefix++;
  return prefix >= 2 ? prefix : 0;
}
