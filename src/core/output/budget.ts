/**
 * Response budgets. Every tool answer is held under a character budget derived from a token budget
 * (4 characters per token, the usual estimate for code). When the full answer does not fit, the
 * tool steps down to a less detailed rendering (the Serena pattern) before anything is cut.
 */
const CHARS_PER_TOKEN = 4;

export function tokensToChars(tokens: number): number {
  return Math.max(1, Math.floor(tokens * CHARS_PER_TOKEN));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const CUT_NOTE = '… (cut to fit the response budget; narrow the request to see the rest)';

/** Cuts text at a line break below the budget and says so. Text within budget is returned as is. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const room = Math.max(0, maxChars - CUT_NOTE.length - 1);
  const breakAt = text.lastIndexOf('\n', room);
  const kept = breakAt > room / 2 ? text.slice(0, breakAt) : text.slice(0, room);
  return `${kept}\n${CUT_NOTE}`;
}

/**
 * Renders the most detailed level that fits. Levels are thunks, most detailed first, so a level is
 * only built when the one before it was too long. The last level is truncated if even it is too long.
 */
export function pickLevel(levels: readonly (() => string)[], maxChars: number): string {
  let last = '';
  for (const render of levels) {
    last = render();
    if (last.length <= maxChars) return last;
  }
  return truncateText(last, maxChars);
}

/** Keeps whole blocks while they fit, and reports how many made it. */
export function takeBlocks(
  blocks: readonly string[],
  maxChars: number,
): { text: string; used: number } {
  let text = '';
  let used = 0;
  for (const block of blocks) {
    const next = used === 0 ? block : `${text}\n${block}`;
    if (next.length > maxChars) break;
    text = next;
    used++;
  }
  if (used === 0 && blocks.length > 0)
    return { text: truncateText(blocks[0] ?? '', maxChars), used: 1 };
  return { text, used };
}
