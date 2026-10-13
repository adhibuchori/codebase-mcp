/**
 * Regex fallback symbols for the JavaScript family, used when a tree-sitter grammar is missing or a
 * file is too large to parse. Each pattern reads one line: classes, function declarations, arrow
 * functions bound to a const, and CommonJS `exports.name = function`. The TypeScript pack adds its
 * type-level declarations on top.
 */
import type { SymbolPattern } from '../../core/model/language-pack.types.ts';

export const jsSymbolPatterns: readonly SymbolPattern[] = [
  {
    kind: 'class',
    regex:
      /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  },
  {
    kind: 'function',
    regex:
      /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  },
  {
    kind: 'function',
    regex:
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]*)?=>|\(\s*$|[A-Za-z_$][\w$]*\s*=>)/,
  },
  {
    kind: 'function',
    regex:
      /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
  },
];
