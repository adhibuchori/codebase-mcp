/**
 * find_symbol in callers and callees modes. The name may be qualified ("OrderService.cancel"); up
 * to three matching definitions are answered at once, more are listed so the caller can pick one.
 */
import { takeBlocks } from '../../core/output/budget.ts';
import type { SymbolHit } from '../../core/model/domain.types.ts';
import { qualifiedName } from '../../core/symbols/symbol-tree.ts';
import { callersOf } from '../../engine/call-graph.ts';
import { calleesOf } from '../../engine/callees.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { findSymbolsIn } from '../../engine/symbols.ts';
import type { ToolContext } from '../registry/define-tool.ts';
import { calleeLines, callerLines, location } from './call-graph.format.ts';

interface GraphArgs {
  readonly name: string;
  readonly kind?: string | undefined;
  readonly mode: 'callers' | 'callees';
  readonly repos?: string[] | undefined;
  readonly group?: string | undefined;
  readonly limit: number;
}

const MAX_TARGETS = 3;

/** Definitions named exactly like the input; "A.b" also checks the container. */
function targetsFor(args: GraphArgs, context: ToolContext): SymbolHit[] {
  const dot = args.name.lastIndexOf('.');
  const name = dot > 0 ? args.name.slice(dot + 1) : args.name;
  const owner = dot > 0 ? args.name.slice(0, dot) : '';
  const everywhere = context.deps.repos.list();
  const found = findSymbolsIn(context.deps, everywhere, {
    name,
    kind: args.kind ?? '',
    limit: 100,
    match: 'exact',
  });
  return found.hits.filter(
    (hit) =>
      hit.name === name &&
      (!owner ||
        hit.container === owner ||
        hit.container.endsWith(`.${owner}`) ||
        qualifiedName(hit) === args.name),
  );
}

function pickOne(args: GraphArgs, targets: readonly SymbolHit[]): string[] {
  const listed = targets
    .slice(0, 20)
    .map((hit) => `  ${hit.kind} ${qualifiedName(hit)} — ${location(hit)}`);
  const example = JSON.stringify({
    name: qualifiedName(targets[0] ?? { container: '', name: args.name }),
    mode: args.mode,
  });
  return [
    `${targets.length} definitions are named "${args.name}". Name the one you mean as Class.method:`,
    ...listed,
    `Example: ${example}`,
  ];
}

export function callGraph(args: GraphArgs, context: ToolContext): string {
  const targets = targetsFor(args, context);
  if (targets.length === 0)
    return `No definition named "${args.name}". Check the name with find_symbol {"name": "${args.name}"}.`;
  if (targets.length > MAX_TARGETS) return takeBlocks(pickOne(args, targets), context.budget).text;
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const blocks = targets.flatMap((hit) =>
    args.mode === 'callers'
      ? callerLines(hit, callersOf(context.deps, hit, repos), args.limit)
      : calleeLines(hit, calleesOf(context.deps, hit, repos), args.limit),
  );
  const step =
    args.mode === 'callers'
      ? 'callers again on an origin to go one level up'
      : 'callees again on a callee to go one level down';
  return takeBlocks(
    [...blocks, `Next: find_symbol with mode ${step}; read_code "repo/path:line" to see a site.`],
    context.budget,
  ).text;
}
