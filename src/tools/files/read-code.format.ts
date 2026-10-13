/** Text for read_code: a header with the facts, numbered lines or an outline, and the next call. */
import { pickLevel } from '../../core/output/budget.ts';
import { numberLines } from '../../core/output/trim.ts';
import type { SymbolDef } from '../../core/model/domain.types.ts';
import { enclosingSymbol, qualifiedName } from '../../core/symbols/symbol-tree.ts';
import type { ReadResult } from './read-code.service.ts';

function ref(result: ReadResult): string {
  return `${result.file.repo.slug}/${result.file.path}`;
}

function outlineLine(symbol: SymbolDef): string {
  const depth = symbol.container ? symbol.container.split('.').length : 0;
  const label = symbol.signature || symbol.name;
  return `${'  '.repeat(depth)}${symbol.kind} ${label}  L${symbol.line}-${symbol.endLine}`;
}

function renderOutline(result: ReadResult, preview: number): string[] {
  const first = result.symbols.find((symbol) => symbol.kind !== 'module');
  const lines = [
    `${ref(result)} · ${result.lang} · ${result.lines.length} lines · outline (${result.symbols.length} symbols)`,
    ...result.symbols.map(outlineLine),
  ];
  if (preview > 0)
    lines.push(`First ${preview} lines:`, ...numberLines(result.lines.slice(0, preview), 1));
  const span = `${ref(result)}:1-${Math.min(result.lines.length, 200)}`;
  lines.push(
    first
      ? `Read one symbol: read_code "${ref(result)}#${qualifiedName(first)}", or a range: "${span}".`
      : `Read a range: read_code "${span}".`,
  );
  return lines;
}

function renderRange(
  result: ReadResult,
  span: { start: number; end: number; more: boolean },
): string[] {
  const { start, end, more } = span;
  const symbol = enclosingSymbol(result.symbols, start);
  const where = symbol ? ` · in ${qualifiedName(symbol)}` : '';
  const head = `${ref(result)} · ${result.lang} · lines ${start}–${end} of ${result.lines.length}${where}`;
  const tail =
    more && end < result.lines.length
      ? [`More: read_code "${ref(result)}:${end + 1}-${Math.min(result.lines.length, end + 200)}"`]
      : [];
  return [head, ...numberLines(result.lines.slice(start - 1, end), start), ...tail];
}

export function renderRead(result: ReadResult, budget: number): string {
  const view = result.view;
  if (view.kind === 'outline') {
    return pickLevel(
      [
        () => renderOutline(result, view.preview).join('\n'),
        () => renderOutline(result, 0).join('\n'),
      ],
      budget,
    );
  }
  const levels = [view.end, view.start + 119, view.start + 59, view.start + 29].map((end) =>
    Math.max(view.start, Math.min(end, view.end)),
  );
  return pickLevel(
    levels.map(
      (end) => () =>
        renderRange(result, {
          start: view.start,
          end,
          more: view.cut || end < view.end || view.reason === 'lines',
        }).join('\n'),
    ),
    budget,
  );
}
