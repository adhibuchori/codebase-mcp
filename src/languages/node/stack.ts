/**
 * V8 stack traces (Node, Bun, Deno, Chrome) as pasted from a terminal or a log: an error line such
 * as `TypeError: msg`, then `    at fn (/app/src/x.ts:12:5)` frames, innermost first. A cause
 * printed by Node (`[cause]: Error: …`) or by a library (`Caused by: …`) starts a new segment.
 * The root cause is where the failure began, so its frames come first; messages stay outermost
 * first. Only `at` lines that end in `:line:column` or carry a function name count as frames, which
 * keeps JVM (`at a.B.c(B.java:3)`) and .NET frames out.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';
import { stackFrame, unescapeTrace } from '../generic/stack-frame.ts';

interface State {
  /** Frames per error, in printed order: the outermost error first. */
  readonly segments: StackFrame[][];
  readonly messages: string[];
  /** The error line seen since the last frame, which the next frame opens a segment with. */
  header: string | undefined;
}

/** A frame line; a trailing ` {` opens the error's own properties, a `"…` ends a JSON string. */
const FRAME_LINE = /^\s*at (?:async )?([^"]+?)(?: \{|".*)?$/;
const LOCATION = /^(.+):(\d+):\d+$/;
const CAUSE = /^\s*(?:\[cause\]:|caused by:)\s*(.*)$/i;
/** The end of an error name: "TypeError: …", "Error [ERR_X]: …", or a bare "Error". */
const ERROR_NAME = /(?:Error|Exception)(?: \[[\w-]+\])?(?::\s|:?$)/;
const NAME_CHAR = /[\w$.]/;
const BRACKETED = /^\s*\[(.*)\]\s*$/;
const ESCAPED_FRAME = /\\n\s+at /;

/** `fn (location)` → its function and location; a bare location has no function. */
function splitBody(body: string): { func: string; location: string } {
  const open = body.endsWith(')') ? body.indexOf(' (') : -1;
  return open > 0
    ? { func: body.slice(0, open), location: body.slice(open + 2, -1) }
    : { func: '', location: body };
}

function parseFrame(line: string): StackFrame | undefined {
  const body = FRAME_LINE.exec(line.trimEnd())?.[1];
  if (body === undefined) return undefined;
  const { func, location } = splitBody(body);
  const place = LOCATION.exec(location);
  if (!place && !func) return undefined;
  const [, file = '', number = '0'] = place ?? [];
  return stackFrame({ raw: line.trim(), file, line: Number(number), func });
}

/** The error line inside a line, from the start of the error's name ("Uncaught " and log prefixes dropped). */
function errorLine(line: string): string | undefined {
  const hit = ERROR_NAME.exec(line);
  if (!hit) return undefined;
  let start = hit.index;
  while (start > 0 && NAME_CHAR.test(line.charAt(start - 1))) start -= 1;
  return line.slice(start).trim();
}

/** The message a non-frame line announces: a cause marker or an error line. */
function headerOf(line: string): string | undefined {
  const cause = CAUSE.exec(line);
  const text = (cause?.[1] ?? line).replace(BRACKETED, '$1');
  const message = errorLine(text) ?? (cause ? text.trim() : undefined);
  /* A trailing `{` opens the error's own properties; trimmed without a regex that would rescan blanks. */
  return message?.endsWith('{') ? message.slice(0, -1).trimEnd() : message;
}

function consume(state: State, line: string): void {
  const frame = parseFrame(line);
  if (!frame) {
    state.header = headerOf(line) ?? state.header;
    return;
  }
  if (state.header !== undefined || state.segments.length === 0) {
    state.segments.push([]);
    if (state.header) state.messages.push(state.header);
    state.header = undefined;
  }
  state.segments.at(-1)?.push(frame);
}

export const nodeStackParser: StackParser = (text) => {
  const state: State = { segments: [], messages: [], header: undefined };
  for (const line of unescapeTrace(text, ESCAPED_FRAME).split(/\r?\n/)) consume(state, line);
  if (state.segments.length === 0) return null;
  const messages = state.header ? [...state.messages, state.header] : state.messages;
  return { runtime: 'node', messages, frames: state.segments.toReversed().flat() };
};
