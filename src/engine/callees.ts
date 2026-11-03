/**
 * Callees: the uses inside one definition, each resolved to the definitions it reaches. Candidates
 * are definitions with the same name in the repos src/engine/callee-repos.ts picks for the use's
 * scope, kept when src/core/graph/judge.ts resolves the use to them. A use that reaches none is
 * reported without a source definition (its scope is known) or as unresolved (it is not).
 */
import { judgeUse, type CallerSite, type GraphTarget, type Verdict } from '../core/graph/judge.ts';
import type { Repo, SymbolHit } from '../core/model/domain.types.ts';
import type { RefHit } from '../core/model/graph.types.ts';
import { qualifiedName } from '../core/symbols/symbol-tree.ts';
import { graphTarget, styleOf, supertypesOf } from './call-graph.ts';
import { calleeRepos, type RepoFinder } from './callee-repos.ts';
import type { EngineDeps } from './engine-deps.types.ts';

type GraphDeps = Pick<EngineDeps, 'index' | 'languages' | 'repos'>;

interface CalleeHit extends Verdict {
  readonly def: SymbolHit;
}

export interface Callee {
  readonly ref: RefHit;
  /** Definitions the use reaches, best first; empty when none was found. */
  readonly defs: readonly CalleeHit[];
}

const PER_NAME = 50;

/** The definition named by the use first, then one reached through a supertype, then likely ones. */
const order = (hit: CalleeHit): number => (hit.confidence === 'exact' ? 0 : 2) + (hit.via ? 1 : 0);

/** Definitions by exact name and their graph targets, looked up once per callees answer. */
function lookups(deps: GraphDeps) {
  const named = new Map<string, SymbolHit[]>();
  const targets = new Map<string, GraphTarget>();
  const definitions = (name: string, repos: readonly Repo[]): SymbolHit[] => {
    const key = `${name}\u0000${repos.map((repo) => repo.slug).join(',')}`;
    const known =
      named.get(key) ??
      repos.flatMap((repo) =>
        deps.index
          .findSymbols(repo, { name, match: 'exact', kind: '', limit: PER_NAME })
          .filter((hit) => hit.name === name),
      );
    named.set(key, known);
    return known;
  };
  const target = (def: SymbolHit): GraphTarget => {
    const key = `${def.repo}/${def.path}#${def.container}.${def.name}`;
    const known = targets.get(key) ?? graphTarget(deps, def);
    targets.set(key, known);
    return known;
  };
  return { definitions, target };
}

type Lookups = ReturnType<typeof lookups>;

function judged(found: Lookups, site: CallerSite, defs: readonly SymbolHit[]): CalleeHit[] {
  return defs.flatMap((def) => {
    const verdict = judgeUse(found.target(def), site);
    return verdict && verdict.confidence !== 'name' ? [{ ...verdict, def }] : [];
  });
}

interface CalleeContext {
  readonly deps: GraphDeps;
  readonly found: Lookups;
  readonly where: RepoFinder;
}

function reached(context: CalleeContext, ref: RefHit): CalleeHit[] {
  const { deps, found } = context;
  const repo = deps.repos.get(ref.repo);
  const type = ref.origin.slice(0, Math.max(0, ref.origin.lastIndexOf('.'))) || ref.origin;
  const style = styleOf(deps, ref.path);
  const site: CallerSite = {
    ref,
    style,
    supertypes: () =>
      repo ? supertypesOf(deps, { repo, path: ref.path }, type) : new Set<string>(),
  };
  const defs = found.definitions(ref.name, context.where(ref, style));
  return judged(found, site, defs).toSorted((a, b) => order(a) - order(b));
}

export function calleesOf(deps: GraphDeps, hit: SymbolHit, repos: readonly Repo[]): Callee[] {
  const repo = deps.repos.get(hit.repo);
  if (!repo) return [];
  const uses = deps.index
    .refsFrom(repo, hit.path, qualifiedName(hit))
    .filter((ref) => ref.kind === 'call' || ref.kind === 'new' || ref.kind === 'render');
  const context = { deps, found: lookups(deps), where: calleeRepos(deps, repos) };
  return uses.map((ref) => ({ ref, defs: reached(context, ref) }));
}
