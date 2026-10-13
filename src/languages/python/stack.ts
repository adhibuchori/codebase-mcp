/**
 * Python tracebacks: `Traceback (most recent call last):`, then `  File "/app/x.py", line 12, in
 * func` frames, outermost first, then the `ValueError: msg` line. Python prints the innermost frame
 * last, so each traceback's frames are reversed. A chained exception ("The above exception was the
 * direct cause…", "During handling of the above exception…") prints the root cause first, so the
 * earlier traceback's frames lead, while messages list the last one printed (the outermost) first.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';
import { stackFrame, unescapeTrace } from '../generic/stack-frame.ts';

interface Traceback {
  readonly frames: StackFrame[];
  message: string;
}

const TRACEBACK = /^\s*Traceback \(most recent call last\):/;
const FRAME = /^\s*File "(.+)", line (\d+)(?:, in (.+))?$/;
const CHAIN_NOTE = /^(?:The above exception|During handling of the above exception)/;
const UNINDENTED = /^\S/;
const ESCAPED_FRAME = /\\n\s+File \\"/;

/** The exception line: the first unindented line after a traceback's frames. */
function isMessage(traceback: Traceback | undefined, line: string): traceback is Traceback {
  if (!traceback || traceback.frames.length === 0 || traceback.message !== '') return false;
  return UNINDENTED.test(line) && !CHAIN_NOTE.test(line);
}

/** A header opens a traceback, and so does a frame after a finished one (or before any). */
function opensTraceback(
  line: string,
  frame: RegExpExecArray | null,
  last: Traceback | undefined,
): boolean {
  return TRACEBACK.test(line) || (frame !== null && (!last || last.message !== ''));
}

function frameOf(frame: RegExpExecArray, line: string): StackFrame {
  const [, file = '', number = '0', func = ''] = frame;
  return stackFrame({ raw: line.trim(), file, line: Number(number), func });
}

function consume(tracebacks: Traceback[], line: string): void {
  const frame = FRAME.exec(line.trimEnd());
  if (opensTraceback(line, frame, tracebacks.at(-1))) tracebacks.push({ frames: [], message: '' });
  const current = tracebacks.at(-1);
  if (frame) current?.frames.push(frameOf(frame, line));
  else if (isMessage(current, line)) current.message = line.trim();
}

export const pythonStackParser: StackParser = (text) => {
  const tracebacks: Traceback[] = [];
  for (const line of unescapeTrace(text, ESCAPED_FRAME).split(/\r?\n/)) consume(tracebacks, line);
  const traced = tracebacks.filter((traceback) => traceback.frames.length > 0);
  if (traced.length === 0) return null;
  return {
    runtime: 'python',
    messages: traced
      .map((traceback) => traceback.message)
      .filter((message) => message !== '')
      .toReversed(),
    frames: traced.flatMap((traceback) => traceback.frames.toReversed()),
  };
};
