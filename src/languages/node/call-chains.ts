/**
 * Method chains in JavaScript source, read without a parser: the call a regex match ends at, and
 * the calls chained after it (`.post(…)\n  .put(…)`), each with its arguments and its line.
 * Express, koa-router and Hono register routes this way, one chain per router.
 */
import type { LineMatch } from '../../core/text/lines.ts';
import { callArgs } from '../generic/source-text.ts';

/** One call: the index of its opening parenthesis, its arguments, its line. */
export interface Call {
  readonly open: number;
  readonly args: string;
  readonly line: number;
}

/** A call in a chain: `.post('/orders', create)`. */
export interface Link extends Call {
  readonly name: string;
}

const NEXT_LINK = /\s*\.([A-Za-z_$][\w$]*)\(/y;

/** The call a match ends at; its line is the line of `.name(`, below a receiver on its own line. */
export function callOf(text: string, match: LineMatch): Call {
  const full = match.groups[0] ?? '';
  const open = match.index + full.length - 1;
  return { open, args: callArgs(text, open), line: match.line + full.split('\n').length - 1 };
}

/** The calls chained after `call`, in order, until the chain ends. */
export function chainAfter(text: string, call: Call): Link[] {
  const chain = new RegExp(NEXT_LINK);
  const links: Link[] = [];
  let { open, args, line } = call;
  chain.lastIndex = open + args.length + 2;
  for (let hit = chain.exec(text); hit; hit = chain.exec(text)) {
    const next = hit.index + hit[0].length - 1;
    line += text.slice(open, next).split('\n').length - 1;
    open = next;
    args = callArgs(text, open);
    links.push({ name: hit[1] ?? '', open, args, line });
    chain.lastIndex = open + args.length + 2;
  }
  return links;
}
