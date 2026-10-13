/**
 * Symbols without a grammar: a language pack's line patterns (first capture group = name). A
 * definition runs until the next definition at the same or lower indentation, or for at most 300
 * lines, which is good enough for outlines and enclosing-symbol labels.
 */
import type { SymbolDef } from '../model/domain.types.ts';
import type { SymbolPattern } from '../model/language-pack.types.ts';
import { buildSymbols, signatureOf, type RawDefinition } from './symbol-tree.ts';

interface Found {
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly indent: number;
  readonly text: string;
}

function findDefinitions(lines: readonly string[], patterns: readonly SymbolPattern[]): Found[] {
  const found: Found[] = [];
  lines.forEach((text, index) => {
    for (const pattern of patterns) {
      const name = pattern.regex.exec(text)?.[1];
      if (name) {
        found.push({
          name,
          kind: pattern.kind,
          line: index + 1,
          indent: text.length - text.trimStart().length,
          text,
        });
        return;
      }
    }
  });
  return found;
}

function endOf(found: readonly Found[], index: number, total: number): number {
  const current = found[index];
  if (!current) return total;
  const next = found.slice(index + 1).find((other) => other.indent <= current.indent);
  const limit = Math.min(total, current.line + 300);
  return next ? Math.min(limit, next.line - 1) : limit;
}

export function regexSymbols(text: string, patterns: readonly SymbolPattern[]): SymbolDef[] {
  if (patterns.length === 0) return [];
  const lines = text.split(/\r?\n/);
  const found = findDefinitions(lines, patterns);
  const raw: RawDefinition[] = found.map((def, index) => ({
    name: def.name,
    kind: def.kind,
    line: def.line,
    endLine: Math.max(def.line, endOf(found, index, lines.length)),
    signature: signatureOf(def.text),
  }));
  return buildSymbols(raw);
}
