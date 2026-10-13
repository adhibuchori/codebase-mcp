/**
 * Parses JVM stack traces (Java, Kotlin, Scala) as printed by Throwable.printStackTrace and the
 * logging frameworks. The root cause is where the bug usually is, so its frames come first, then
 * each enclosing exception's; suppressed exceptions follow last. The path hint is the class's
 * package as folders plus the printed file name, which is how JVM sources sit in a repo.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';

/** One exception of a chain: its message line and its own frames. */
interface Segment {
  readonly message: string;
  readonly frames: StackFrame[];
  readonly suppressed: boolean;
}

/** One printed trace: the outermost exception, its causes and its suppressed exceptions. */
interface Chain {
  readonly indent: number;
  readonly segments: Segment[];
}

interface Header {
  readonly message: string;
  readonly indent: number;
}

interface State {
  readonly chains: Chain[];
  current: Segment | null;
  candidate: Header | null;
}

/** `at [module/]pkg.Class.method(Location)`; a module (java.base@17/, app//) is not in the name. */
const FRAME = /^\s*at\s+([^\s(]+)\(([^)]*)\)/;
const SOURCE_FILE = /^([^\s:()]+\.\w+)(?::(\d+))?$/;
const NO_SOURCE = /^(?:Native Method|Unknown Source|<generated>)$/;
const HEADER =
  /^(\s*)(?:(Caused by|Suppressed): )?(?:Exception in thread "[^"]*" )?([\w$]+(?:\.[\w$]+)*(?::.*)?)$/;
/** A qualified class name, or one named like an exception: what an unprefixed header must hold. */
const EXCEPTION_NAME = /^[^:]*(?:\.|Exception|Error|Throwable)/;

function pathHintOf(func: string, file: string): string {
  const owner = func.slice(0, Math.max(0, func.lastIndexOf('.')));
  const dot = owner.lastIndexOf('.');
  return dot === -1 ? file : `${owner.slice(0, dot).replaceAll('.', '/')}/${file}`;
}

/** "OrderService.java:42" or "OrderService.java"; "" for Native Method and Unknown Source. */
function sourceOf(location: string): { file: string; line: number } | null {
  if (NO_SOURCE.test(location)) return { file: '', line: 0 };
  const source = SOURCE_FILE.exec(location);
  return source ? { file: source[1] ?? '', line: Number(source[2] ?? 0) } : null;
}

function frameOf(raw: string): StackFrame | null {
  const [, printed = '', location = ''] = FRAME.exec(raw) ?? [];
  const source = printed ? sourceOf(location) : null;
  if (!source) return null;
  const func = printed.slice(printed.lastIndexOf('/') + 1);
  const pathHint = source.file ? pathHintOf(func, source.file) : '';
  return { raw: raw.trim(), file: source.file, line: source.line, func, pathHint };
}

function addFrame(state: State, frame: StackFrame): void {
  let segment = state.current;
  if (!segment) {
    const header = state.candidate ?? { message: '', indent: 0 };
    segment = { message: header.message, frames: [], suppressed: false };
    state.chains.push({ indent: header.indent, segments: [segment] });
    state.current = segment;
    state.candidate = null;
  }
  segment.frames.push(frame);
}

/** "Caused by:" and "Suppressed:"; a cause indented under a suppressed exception belongs to it. */
function addNested(state: State, header: Header, suppressed: boolean): void {
  let chain = state.chains.at(-1);
  if (!chain) {
    chain = { indent: header.indent, segments: [] };
    state.chains.push(chain);
  }
  const segment: Segment = {
    message: header.message,
    frames: [],
    suppressed: suppressed || header.indent > chain.indent,
  };
  chain.segments.push(segment);
  state.current = segment;
}

function readLine(state: State, line: string): void {
  const frame = frameOf(line);
  const header = frame ? null : HEADER.exec(line);
  const [, indent = '', prefix, message = ''] = header ?? [];
  if (frame) {
    addFrame(state, frame);
  } else if (prefix) {
    addNested(state, { message, indent: indent.length }, prefix === 'Suppressed');
  } else if (header && EXCEPTION_NAME.test(message)) {
    state.current = null;
    state.candidate = { message, indent: indent.length };
  }
}

/** Main exceptions outermost first, then the suppressed ones. */
function partition(chain: Chain): { main: Segment[]; suppressed: Segment[] } {
  return {
    main: chain.segments.filter((segment) => !segment.suppressed),
    suppressed: chain.segments.filter((segment) => segment.suppressed),
  };
}

function framesOf(chain: Chain): StackFrame[] {
  const { main, suppressed } = partition(chain);
  return [...main.toReversed(), ...suppressed].flatMap((segment) => segment.frames);
}

function messagesOf(chain: Chain): string[] {
  const { main, suppressed } = partition(chain);
  return [...main, ...suppressed].map((segment) => segment.message).filter(Boolean);
}

/** A trace copied out of a JSON log carries escaped newlines and tabs. */
function unescapeJson(text: string): string {
  if (!text.includes('\\n\\tat ')) return text;
  return text.replaceAll('\\n', '\n').replaceAll('\\t', '\t');
}

export const jvmStackParser: StackParser = (text) => {
  const state: State = { chains: [], current: null, candidate: null };
  for (const line of unescapeJson(text).split(/\r?\n/)) readLine(state, line);
  const frames = state.chains.flatMap(framesOf);
  if (frames.length === 0) return null;
  return { runtime: 'jvm', messages: state.chains.flatMap(messagesOf), frames };
};
