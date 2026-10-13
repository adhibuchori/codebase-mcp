/**
 * Ruby backtraces: `app/models/order.rb:12:in 'cancel': msg (OrderError)` then
 * `\tfrom app/controllers/orders_controller.rb:20:in 'update'` (Ruby 3.4 quotes the method, older
 * versions open with a backtick), or a Rails log's `OrderError (msg):` header followed by bare
 * backtrace lines. A frame carrying a message, or a Rails header, starts an exception. Ruby prints
 * each cause after the exception it caused, so the root cause's frames are moved first.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';
import { stackFrame } from '../generic/stack-frame.ts';

interface State {
  /** Frames per exception, in printed order: the outermost exception first. */
  readonly segments: StackFrame[][];
  readonly messages: string[];
  /** A Rails header seen since the last frame. */
  header: string | undefined;
}

/** The path starts at a non-space, so leading whitespace cannot be read two ways (no quadratic backtracking). */
const FRAME = /^\s*(?:from\s+)?(\S.*?):(\d+):in [`'](.*?)'(?::\s(.*))?$/;
const RAILS_HEADER = /^\s*([A-Z][\w:]*) \((.*)\):?$/;

/** A Rails header in Ruby's own message form: "msg (ErrorClass)". */
function railsHeader(line: string): string | undefined {
  const header = RAILS_HEADER.exec(line);
  return header ? `${header[2] ?? ''} (${header[1] ?? ''})` : undefined;
}

function frameOf(frame: RegExpExecArray, line: string): StackFrame {
  const [, file = '', number = '0', func = ''] = frame;
  return stackFrame({ raw: line.trim(), file, line: Number(number), func });
}

function consume(state: State, line: string): void {
  const frame = FRAME.exec(line.trimEnd());
  if (!frame) {
    state.header = railsHeader(line.trimEnd()) ?? state.header;
    return;
  }
  const message = frame[4] ?? state.header;
  if (message !== undefined || state.segments.length === 0) {
    state.segments.push([]);
    if (message) state.messages.push(message);
    state.header = undefined;
  }
  state.segments.at(-1)?.push(frameOf(frame, line));
}

export const rubyStackParser: StackParser = (text) => {
  const state: State = { segments: [], messages: [], header: undefined };
  for (const line of text.split(/\r?\n/)) consume(state, line);
  if (state.segments.length === 0) return null;
  return { runtime: 'ruby', messages: state.messages, frames: state.segments.toReversed().flat() };
};
