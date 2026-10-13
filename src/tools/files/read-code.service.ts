/**
 * read_code's decisions: which lines to show for a reference. A symbol reference reads exactly that
 * definition; a line reads the lines around it; a small file is shown whole; a large file without a
 * location shows its outline first, so the next call can read just the part that matters.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { SymbolDef } from '../../core/model/domain.types.ts';
import { qualifiedName } from '../../core/symbols/symbol-tree.ts';
import { clampWindow, windowAround } from '../../core/text/lines.ts';
import { parseRef, type CodeRef } from '../../core/text/ref.ts';
import { readTextFile, resolveFile, type SafeFile } from '../../engine/file-access.ts';
import { requireRepo } from '../../engine/repo-scope.ts';
import { symbolsOfFile } from '../../engine/symbols.ts';
import type { ToolContext } from '../registry/define-tool.ts';

type ReadView =
  | { readonly kind: 'outline'; readonly preview: number }
  | {
      readonly kind: 'range';
      readonly start: number;
      readonly end: number;
      readonly cut: boolean;
      readonly reason: 'symbol' | 'lines' | 'file';
    };

export interface ReadResult {
  readonly file: SafeFile;
  readonly lang: string;
  readonly lines: readonly string[];
  readonly symbols: readonly SymbolDef[];
  readonly view: ReadView;
}

function findSymbol(symbols: readonly SymbolDef[], wanted: string): SymbolDef {
  const lower = wanted.toLowerCase();
  const found =
    symbols.find((symbol) => qualifiedName(symbol).toLowerCase() === lower) ??
    symbols.find((symbol) => symbol.name.toLowerCase() === lower) ??
    symbols.find((symbol) => qualifiedName(symbol).toLowerCase().endsWith(`.${lower}`));
  if (found) return found;
  const names = symbols.slice(0, 15).map(qualifiedName).join(', ');
  const hint = names
    ? `Symbols here: ${names}.`
    : 'This file has no symbols; read it by line range.';
  throw new ToolError(`No symbol "${wanted}" in this file.`, hint);
}

function range(
  total: number,
  wanted: { start: number; end: number; reason: 'symbol' | 'lines' | 'file' },
  max: number,
): ReadView {
  const window = clampWindow(total, wanted.start, wanted.end);
  const end = Math.min(window.end, window.start + max - 1);
  return { kind: 'range', start: window.start, end, cut: end < window.end, reason: wanted.reason };
}

function chooseView(
  ref: CodeRef,
  data: { lines: readonly string[]; symbols: readonly SymbolDef[] },
  options: { mode: string; radius: number; max: number },
): ReadView {
  const total = data.lines.length;
  if (options.mode === 'outline') return { kind: 'outline', preview: 0 };
  if (ref.symbol) {
    const symbol = findSymbol(data.symbols, ref.symbol);
    return range(total, { start: symbol.line, end: symbol.endLine, reason: 'symbol' }, options.max);
  }
  if (ref.line !== undefined) {
    const wanted =
      ref.endLine === undefined
        ? windowAround(total, ref.line, options.radius)
        : { start: ref.line, end: ref.endLine };
    return range(total, { ...wanted, reason: 'lines' }, options.max);
  }
  if (total <= options.max || options.mode === 'content' || data.symbols.length === 0)
    return range(total, { start: 1, end: total, reason: 'file' }, options.max);
  return { kind: 'outline', preview: 30 };
}

export async function readCode(
  args: { ref: string; mode: string; context: number },
  context: ToolContext,
): Promise<ReadResult> {
  const ref = parseRef(args.ref);
  const repo = requireRepo(context.deps.repos, ref.repo);
  const file = await resolveFile(context.deps, repo, ref.path);
  const lines = await readTextFile(
    { ...context.deps, maxFileBytes: context.deps.limits.maxFileBytes },
    file,
  );
  const symbols = await symbolsOfFile(context.deps, file, async () => lines);
  const view = chooseView(
    ref,
    { lines, symbols },
    { mode: args.mode, radius: args.context, max: context.deps.limits.maxReadLines },
  );
  return {
    file,
    lang: context.deps.languages.forPath(file.path)?.name ?? 'text',
    lines,
    symbols,
    view,
  };
}
