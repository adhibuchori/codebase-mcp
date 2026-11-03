/**
 * The call-graph side of tree-sitter: a pack's graph query (its parts under assets/queries/graph/,
 * joined in order) compiled once per pack, and query matches turned into plain captures for
 * src/core/graph/file-graph.ts. A language without a graph query still yields its calls, by name,
 * from the `@reference.call` captures of its tags query.
 */
import { readFile } from 'node:fs/promises';
import { Query, type Language, type Node as SyntaxNode } from 'web-tree-sitter';
import type { RawMatch } from '../../core/model/graph.types.ts';
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import type { Logger } from '../../ports/runtime.ts';

export interface GraphQueryDeps {
  readonly queriesDir: string;
  readonly logger: Logger;
}

export type GraphQueryLoader = (pack: LanguagePack, language: Language) => Promise<Query | null>;

/** Compiles each pack's graph query once; one that fails to load is remembered as null. */
export function graphQueryLoader(deps: GraphQueryDeps): GraphQueryLoader {
  const queries = new Map<string, Promise<Query | null>>();
  const load = async (pack: LanguagePack, language: Language): Promise<Query | null> => {
    const parts = pack.graph?.queries ?? [];
    try {
      const sources = await Promise.all(
        parts.map(async (part) => readFile(`${deps.queriesDir}/graph/${part}.scm`, 'utf8')),
      );
      return new Query(language, sources.join('\n'));
    } catch (error) {
      deps.logger.warn('graph query unavailable, calls matched by name', {
        language: pack.id,
        error: String(error),
      });
      return null;
    }
  };
  return (pack, language) => {
    const cached = queries.get(pack.id) ?? load(pack, language);
    queries.set(pack.id, cached);
    return cached;
  };
}

/** Every match as plain captures (name, text, 1-based line). */
export function rawMatches(query: Query, root: SyntaxNode): RawMatch[] {
  return query.matches(root).map((match) =>
    match.captures.map((capture) => ({
      name: capture.name,
      text: capture.node.text,
      line: capture.node.startPosition.row + 1,
    })),
  );
}

/** The calls a tags query marks with `@reference.call`, as `call.name` captures. */
export function tagCalls(query: Query, root: SyntaxNode): RawMatch[] {
  return query.matches(root).flatMap((match) => {
    const isCall = match.captures.some((capture) => capture.name === 'reference.call');
    const name = match.captures.find((capture) => capture.name === 'name');
    if (!isCall || !name) return [];
    return [[{ name: 'call.name', text: name.node.text, line: name.node.startPosition.row + 1 }]];
  });
}
