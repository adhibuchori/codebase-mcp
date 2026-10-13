/**
 * SymbolParser on web-tree-sitter (WASM: no compiler, no native module, runs on Bun and Node).
 * Grammars and tags queries are vendored under assets/ and loaded on first use. A grammar that
 * fails to load, a huge or minified file, or a parse error falls back to the pack's regexes.
 */
import { readFile } from 'node:fs/promises';
import { Language, Parser, Query, type Node as SyntaxNode } from 'web-tree-sitter';
import type { SymbolDef } from '../../core/model/domain.types.ts';
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { regexSymbols } from '../../core/symbols/regex-symbols.ts';
import { buildSymbols, signatureOf, type RawDefinition } from '../../core/symbols/symbol-tree.ts';
import type { Logger, SymbolParser } from '../../ports/runtime.ts';

export interface TreeSitterDeps {
  readonly grammarsDir: string;
  readonly queriesDir: string;
  readonly logger: Logger;
}

interface Grammar {
  readonly language: Language;
  readonly query: Query;
}

const MAX_PARSE_BYTES = 512 * 1024;

function definitionsOf(query: Query, root: SyntaxNode): RawDefinition[] {
  return query.matches(root).flatMap((match) => {
    const definition = match.captures.find((capture) => capture.name.startsWith('definition.'));
    const name = match.captures.find((capture) => capture.name === 'name');
    if (!definition || !name) return [];
    const node = definition.node;
    return [
      {
        name: name.node.text,
        kind: definition.name.slice('definition.'.length),
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        signature: signatureOf(node.text.split('\n')[0] ?? ''),
      },
    ];
  });
}

function looksMinified(text: string): boolean {
  const lines = text.length / Math.max(1, text.split('\n').length);
  return lines > 400;
}

/** Loads each grammar and its tags query once; a grammar that fails to load is remembered as null. */
function grammarLoader(deps: TreeSitterDeps): (id: string) => Promise<Grammar | null> {
  let ready: Promise<void> | undefined;
  const grammars = new Map<string, Promise<Grammar | null>>();
  const load = async (id: string): Promise<Grammar | null> => {
    try {
      ready ??= Parser.init();
      await ready;
      const language = await Language.load(`${deps.grammarsDir}/${id}.wasm`);
      const query = new Query(language, await readFile(`${deps.queriesDir}/${id}.scm`, 'utf8'));
      return { language, query };
    } catch (error) {
      deps.logger.warn('grammar unavailable, using regex symbols', {
        grammar: id,
        error: String(error),
      });
      return null;
    }
  };
  return (id) => {
    const cached = grammars.get(id) ?? load(id);
    grammars.set(id, cached);
    return cached;
  };
}

export function createTreeSitterParser(deps: TreeSitterDeps): SymbolParser {
  const grammarFor = grammarLoader(deps);
  return {
    parse: async (pack: LanguagePack, text: string): Promise<SymbolDef[]> => {
      const fallback = (): SymbolDef[] => regexSymbols(text, pack.symbolPatterns ?? []);
      if (!pack.grammar || text.length > MAX_PARSE_BYTES || looksMinified(text)) return fallback();
      const grammar = await grammarFor(pack.grammar);
      if (!grammar) return fallback();
      const parser = new Parser();
      parser.setLanguage(grammar.language);
      const tree = parser.parse(text);
      try {
        return tree ? buildSymbols(definitionsOf(grammar.query, tree.rootNode)) : fallback();
      } finally {
        tree?.delete();
        parser.delete();
      }
    },
  };
}
