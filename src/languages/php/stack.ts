/**
 * PHP traces in the two shapes logs carry. Native: `PHP Fatal error:  Uncaught Exception: msg in
 * /app/x.php:12`, `Stack trace:`, then `#0 /app/y.php(42): App\Foo->bar()` frames, innermost
 * first; a chain prints the previous (root) exception first and each wrapper after `Next`.
 * Laravel and Monolog: `[object] (App\\Exceptions\\X(code: 0): msg at /app/x.php:12)` and
 * `[stacktrace]`, the wrapper first and each cause after `[previous exception]`. The throw site is
 * no `#` frame, so it becomes the first frame of its exception; frames list the root cause first.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';
import { stackFrame, unescapeTrace } from '../generic/stack-frame.ts';

interface Thrown {
  readonly message: string;
  readonly frames: StackFrame[];
}

interface Header {
  readonly raw: string;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  /** True when this exception wraps the one before it (native `Next`). */
  readonly wraps: boolean;
}

interface State {
  /** The exceptions of the chain, outermost first. */
  readonly chain: Thrown[];
  current: Thrown | undefined;
}

const NATIVE_HEADER =
  /^(?:\[[^\]]*\]\s*)?(?:PHP )?(?:Fatal error:\s+)?(Uncaught |Next )?(\S.*?) in (\S+\.php)(?::| on line )(\d+)$/;
const LOGGED_HEADER = /\[object\] \(([^(\s]+)\(code: [^)]*\): (.*) at (\S+\.php):(\d+)\)/;
/** A `#N` frame at the start of a line, or of a JSON string (`"trace":"#0 …`). */
const FRAME = /(?:^|")\s*#\d+ (.+?)\((\d+)\): (.+)$/;
const INTERNAL_FRAME = /(?:^|")\s*#\d+ \[internal function\]: (.+)$/;
const ESCAPED_FRAME = /\\n#\d+ /;

/** `App\Foo->bar(Object(App\Order), 42)` → `App\Foo->bar`: arguments are runtime values. */
const callee = (call: string): string => call.replace(/\(.*$/, '');

function headerOf(line: string): Header | undefined {
  const native = NATIVE_HEADER.exec(line);
  if (native) {
    const [raw, prefix, message = '', file = '', number = '0'] = native;
    return { raw, message, file, line: Number(number), wraps: prefix === 'Next ' };
  }
  const logged = LOGGED_HEADER.exec(line);
  if (!logged) return undefined;
  const [raw, name = '', message = '', file = '', number = '0'] = logged;
  return { raw, message: `${name}: ${message}`, file, line: Number(number), wraps: false };
}

function frameOf(line: string): StackFrame | undefined {
  const frame = FRAME.exec(line);
  if (frame) {
    const [, file = '', number = '0', call = ''] = frame;
    return stackFrame({ raw: line.trim(), file, line: Number(number), func: callee(call) });
  }
  const internal = INTERNAL_FRAME.exec(line);
  return internal
    ? stackFrame({ raw: line.trim(), file: '', line: 0, func: callee(internal[1] ?? '') })
    : undefined;
}

function consume(state: State, line: string): void {
  const header = headerOf(line.trimEnd());
  if (header) {
    const throwSite = stackFrame({
      raw: header.raw.trim(),
      file: header.file,
      line: header.line,
      func: '',
    });
    state.current = { message: header.message, frames: [throwSite] };
    if (header.wraps) state.chain.unshift(state.current);
    else state.chain.push(state.current);
    return;
  }
  const frame = frameOf(line.trimEnd());
  if (!frame) return;
  if (!state.current) {
    state.current = { message: '', frames: [] };
    state.chain.push(state.current);
  }
  state.current.frames.push(frame);
}

export const phpStackParser: StackParser = (text) => {
  const state: State = { chain: [], current: undefined };
  for (const line of unescapeTrace(text, ESCAPED_FRAME).split(/\r?\n/)) consume(state, line);
  if (state.chain.length === 0) return null;
  return {
    runtime: 'php',
    messages: state.chain.map((thrown) => thrown.message).filter((message) => message !== ''),
    frames: state.chain.toReversed().flatMap((thrown) => thrown.frames),
  };
};
