/**
 * Route prefixes. Some frameworks declare a prefix by nesting rather than by a variable: Rails
 * `namespace :api do`, Phoenix `scope "/api"`, Laravel `Route::prefix('api')->group(…)`, and proto
 * `service X {` blocks. Those files are kept tidily indented, so a scope is taken to enclose the
 * lines indented deeper than the line that opens it, and no parser is needed.
 */
import { joinRoute } from '../../core/routes/route-match.ts';

export interface ScopedLine {
  readonly text: string;
  readonly line: number;
  /** Values of the scopes enclosing the line, outermost first. */
  readonly scopes: readonly string[];
}

interface OpenScope {
  readonly indent: number;
  readonly value: string;
}

/** Pops the scopes a line at `indent` has left: those opened at the same or a deeper indentation. */
function closeScopes(stack: OpenScope[], indent: number): void {
  while ((stack.at(-1)?.indent ?? -1) >= indent) stack.pop();
}

/** Every line with the scopes around it; `opens` gives the value of the scope a line opens. */
export function scopedLines(
  text: string,
  opens: (line: string) => string | undefined,
): ScopedLine[] {
  const stack: OpenScope[] = [];
  return text.split(/\r?\n/).map((source, index) => {
    const indent = source.search(/\S/);
    if (indent >= 0) closeScopes(stack, indent);
    const scopes = stack.map((scope) => scope.value);
    const value = indent >= 0 ? opens(source) : undefined;
    if (value !== undefined) stack.push({ indent, value });
    return { text: source, line: index + 1, scopes };
  });
}

/** The path behind the prefix, joined; the path exactly as declared when there is no prefix. */
export function withPrefix(prefix: string, path: string): string {
  return prefix ? joinRoute(prefix, path) : path;
}

/** The prefix a stack of scopes adds up to. */
export function scopePrefix(scopes: readonly string[]): string {
  return scopes.reduce(withPrefix, '');
}
