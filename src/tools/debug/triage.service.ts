/**
 * triage_error's work: decide what the pasted text is (a stack trace, a log line or error message,
 * or a URL), then resolve it to code: frames to files, messages to the statement that writes them,
 * a URL to its handler. Each finding carries a few lines of code so one call is often enough.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { enclosingSymbol, qualifiedName } from '../../core/symbols/symbol-tree.ts';
import { windowAround } from '../../core/text/lines.ts';
import { detectKind, findEndpoints, type EndpointReport } from '../../engine/endpoints.ts';
import { readTextFile, resolveFile } from '../../engine/file-access.ts';
import { findLogSources, type LogSearch } from '../../engine/log-source.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { resolveTrace, type TraceReport } from '../../engine/stack-trace.ts';
import { symbolsOfFile } from '../../engine/symbols.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export type TriageKind = 'auto' | 'stacktrace' | 'log' | 'url';

export interface Snippet {
  readonly ref: string;
  readonly symbol: string;
  readonly focus: number;
  /** Set when the line is past the end of the file: the code that ran differs from this checkout. */
  readonly note: string;
  readonly lines: readonly { readonly number: number; readonly text: string }[];
}

export type Triage =
  | {
      readonly kind: 'stacktrace';
      readonly report: TraceReport;
      readonly snippets: readonly Snippet[];
      readonly sources: LogSearch | null;
    }
  | { readonly kind: 'log'; readonly search: LogSearch; readonly snippets: readonly Snippet[] }
  | { readonly kind: 'url'; readonly query: string; readonly report: EndpointReport };

function detectTriageKind(text: string, context: ToolContext): Exclude<TriageKind, 'auto'> {
  if ((context.deps.languages.parseTrace(text)?.frames.length ?? 0) > 0) return 'stacktrace';
  const single = text.trim();
  if (!single.includes('\n') && detectKind(single) === 'http') return 'url';
  return 'log';
}

async function snippet(
  context: ToolContext,
  at: { repo: Repo; path: string; line: number },
  radius: number,
): Promise<Snippet | null> {
  try {
    const file = await resolveFile(context.deps, at.repo, at.path);
    const lines = await readTextFile(
      { ...context.deps, maxFileBytes: context.deps.limits.maxFileBytes },
      file,
    );
    const symbols = await symbolsOfFile(context.deps, file, async () => lines);
    const window = windowAround(lines.length, Math.max(1, at.line), radius);
    const symbol = enclosingSymbol(symbols, at.line);
    const shown = lines
      .slice(window.start - 1, window.end)
      .map((text, index) => ({ number: window.start + index, text }));
    const note =
      at.line > lines.length
        ? `line ${at.line} is past the end of this file (${lines.length} lines): the build that failed differs from this checkout`
        : '';
    return {
      ref: `${at.repo.slug}/${at.path}:${at.line}`,
      symbol: symbol ? qualifiedName(symbol) : '',
      focus: at.line,
      note,
      lines: shown,
    };
  } catch {
    return null;
  }
}

async function snippets(
  context: ToolContext,
  places: readonly { repo: Repo; path: string; line: number }[],
  radius: number,
): Promise<Snippet[]> {
  const found = await Promise.all(places.map((place) => snippet(context, place, radius)));
  return found.filter((entry): entry is Snippet => entry !== null);
}

async function triageTrace(
  context: ToolContext,
  text: string,
  repos: readonly Repo[],
): Promise<Triage> {
  const trace = context.deps.languages.parseTrace(text);
  if (!trace)
    throw new ToolError(
      'No stack frames recognised in the text.',
      'Paste the full trace, or use kind "log" for a single error line.',
    );
  const report = await resolveTrace(context.deps, trace, repos);
  const top = report.resolved
    .slice(0, 3)
    .map((entry) => ({ repo: entry.repo, path: entry.path, line: entry.frame.line }));
  const message = trace.messages[0];
  const sources = message ? await findLogSources(context.deps, message, repos) : null;
  return { kind: 'stacktrace', report, snippets: await snippets(context, top, 3), sources };
}

async function triageLog(
  context: ToolContext,
  text: string,
  repos: readonly Repo[],
): Promise<Triage> {
  const search = await findLogSources(context.deps, text, repos);
  const bySlug = new Map(repos.map((repo) => [repo.slug, repo]));
  const places = search.candidates.slice(0, 4).flatMap(({ match }) => {
    const repo = bySlug.get(match.repo);
    return repo ? [{ repo, path: match.path, line: match.line }] : [];
  });
  return { kind: 'log', search, snippets: await snippets(context, places, 2) };
}

export async function triage(
  args: {
    text: string;
    kind: TriageKind;
    repos?: string[] | undefined;
    group?: string | undefined;
  },
  context: ToolContext,
): Promise<Triage> {
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const kind = args.kind === 'auto' ? detectTriageKind(args.text, context) : args.kind;
  if (kind === 'stacktrace') return triageTrace(context, args.text, repos);
  if (kind === 'log') return triageLog(context, args.text, repos);
  const query = args.text.trim().split('\n')[0] ?? '';
  const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.exec(query)?.[1] ?? '';
  return {
    kind: 'url',
    query,
    report: findEndpoints(context.deps, { query, kind: 'http', method, repos }),
  };
}
