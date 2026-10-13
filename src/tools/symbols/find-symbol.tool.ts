/** find_symbol: definitions by name from the symbol index, or every reference to a name. */
import { z } from 'zod';
import { takeBlocks } from '../../core/output/budget.ts';
import { plural } from '../../core/output/trim.ts';
import { qualifiedName } from '../../core/symbols/symbol-tree.ts';
import type { SymbolHit } from '../../core/model/domain.types.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { findSymbolsIn } from '../../engine/symbols.ts';
import { defineTool, type ToolContext } from '../registry/define-tool.ts';
import { groupField, limitField, reposField } from '../registry/shared-input.ts';
import { findReferences } from './references.ts';

interface SymbolArgs {
  readonly name: string;
  readonly kind?: string | undefined;
  readonly mode: 'definitions' | 'references';
  readonly repos?: string[] | undefined;
  readonly group?: string | undefined;
  readonly limit: number;
}

function hitLine(hit: SymbolHit): string {
  const range = hit.endLine > hit.line ? `${hit.line}-${hit.endLine}` : String(hit.line);
  return `${hit.kind} ${qualifiedName(hit)} — ${hit.repo}/${hit.path}:${range}${hit.signature ? `\n    ${hit.signature}` : ''}`;
}

function definitions(args: SymbolArgs, context: ToolContext): string {
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const found = findSymbolsIn(context.deps, repos, {
    name: args.name,
    kind: args.kind ?? '',
    limit: args.limit,
  });
  const notes: string[] = [];
  if (found.unindexed.length > 0)
    notes.push(
      `Not indexed yet (skipped): ${found.unindexed.slice(0, 10).join(', ')}${found.unindexed.length > 10 ? ', …' : ''}. search_code covers them meanwhile.`,
    );
  if (found.hits.length === 0)
    notes.push(
      `No definition named like "${args.name}". Try a shorter part of the name, or search_code with mode "word".`,
    );
  else
    notes.push(
      `Read one: read_code "${found.hits[0]?.repo}/${found.hits[0]?.path}#${qualifiedName(found.hits[0] ?? { container: '', name: args.name })}".`,
    );
  const header = `"${args.name}": ${plural(found.hits.length, 'definition')}${found.hits.length >= args.limit ? ' (limit reached)' : ''}`;
  return takeBlocks([header, ...found.hits.map(hitLine), ...notes], context.budget).text;
}

export const findSymbolTool = defineTool({
  name: 'find_symbol',
  title: 'Find symbol',
  description:
    'Finds where a class, function, method, interface or type is defined, across every repo, from the symbol index (exact name first, then prefix, then substring). Returns kind, Class.method, file and line range, and the signature. With mode "references" it lists every whole-word use of the name instead, grouped by file, without the definitions. Example: {"name": "OrderService"} or {"name": "cancelOrder", "mode": "references"}.',
  input: {
    name: z.string().min(1).max(200).describe('Symbol name, or a part of it.'),
    kind: z
      .string()
      .optional()
      .describe('Only this kind: class, interface, method, function, type, enum, struct, module.'),
    mode: z.enum(['definitions', 'references']).default('definitions'),
    repos: reposField,
    group: groupField,
    limit: limitField(20, 100),
  },
  run: async (args, context) =>
    args.mode === 'references' ? findReferences(args, context) : definitions(args, context),
});
