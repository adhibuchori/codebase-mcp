/** Text for triage_error and find_endpoint: findings first, each with its reference and a few lines. */
import { takeBlocks } from '../../core/output/budget.ts';
import { plural, trimLine } from '../../core/output/trim.ts';
import type { EndpointReport, ScoredRoute } from '../../engine/endpoints.ts';
import type { LogSearch } from '../../engine/log-source.ts';
import type { Snippet, Triage } from './triage.service.ts';

function snippetBlock(entry: Snippet, label: string): string {
  const head = `${label}${entry.ref}${entry.symbol ? ` · in ${entry.symbol}` : ''}${entry.note ? ` · ${entry.note}` : ''}`;
  const body = entry.lines.map(
    (line) =>
      `${line.number === entry.focus ? '>' : ' '} ${line.number}: ${trimLine(line.text, 1)}`,
  );
  return [head, ...body].join('\n');
}

function sourcesBlock(search: LogSearch, max: number): string[] {
  if (search.candidates.length === 0)
    return [
      `No statement found for: ${search.fragments.map((f) => `"${f}"`).join(', ') || '(no searchable text)'}.`,
    ];
  return search.candidates
    .slice(0, max)
    .map(
      ({ match, logCall, fragments }) =>
        `- ${match.repo}/${match.path}:${match.line}${logCall ? ' (log/throw)' : ''} · ${fragments.length} of ${search.fragments.length} fragments: ${trimLine(match.text, match.column, 100)}`,
    );
}

function traceBlocks(result: Extract<Triage, { kind: 'stacktrace' }>): string[] {
  const { report } = result;
  const appFrames = report.resolved.length + report.unresolved.length;
  const lines = [
    `Stack trace (${report.trace.runtime}): ${report.trace.messages[0] ?? '(no message)'}`,
    `Resolved ${report.resolved.length} of ${plural(appFrames, 'application frame')}; ${plural(report.libraryFrames, 'library frame')} skipped.`,
    ...result.snippets.map((entry, index) => snippetBlock(entry, `#${index + 1} `)),
    ...report.resolved
      .slice(3, 10)
      .map(
        (entry) =>
          `- ${entry.repo.slug}/${entry.path}:${entry.frame.line} (${entry.frame.func})${entry.alternatives > 0 ? ` · ${entry.alternatives} other candidates` : ''}`,
      ),
  ];
  if (report.unresolved.length > 0)
    lines.push(
      `Not in these repos: ${report.unresolved
        .slice(0, 5)
        .map((frame) => frame.raw.trim())
        .join(' | ')}`,
    );
  if (result.sources)
    lines.push('Where the message is created:', ...sourcesBlock(result.sources, 3));
  return lines;
}

function routeLine(entry: ScoredRoute): string {
  const route = entry.route;
  const method = route.method && route.method !== 'ANY' ? `${route.method} ` : '';
  return `- ${route.repo}/${route.path}:${route.line}  ${method}${route.pattern}  (${route.framework}, ${route.role})`;
}

export function endpointBlocks(query: string, report: EndpointReport, limit: number): string[] {
  const lines = [`${report.kind.toUpperCase()} ${query}`];
  lines.push(
    report.serving.length > 0 ? 'Served by:' : 'No handler, consumer or definition matches.',
    ...report.serving.slice(0, limit).map(routeLine),
  );
  if (report.sending.length > 0)
    lines.push('Called or produced by:', ...report.sending.slice(0, limit).map(routeLine));
  if (report.unindexed.length > 0)
    lines.push(
      `Not indexed yet: ${report.unindexed.slice(0, 10).join(', ')} (search_code covers them).`,
    );
  if (report.serving.length + report.sending.length === 0)
    lines.push(
      'Hint: search_code for the static part of the path (e.g. "/orders/") or the topic name in quotes.',
    );
  return lines;
}

export function renderTriage(result: Triage, budget: number): string {
  if (result.kind === 'url')
    return takeBlocks(endpointBlocks(result.query, result.report, 10), budget).text;
  if (result.kind === 'stacktrace')
    return takeBlocks(
      [
        ...traceBlocks(result),
        'Next: read_code on a reference above, or git_history action "log" with its path for recent changes.',
      ],
      budget,
    ).text;
  const blocks = [
    `Log/error text → code. Fragments searched: ${result.search.fragments.map((f) => `"${f}"`).join(', ') || 'none'}`,
  ];
  blocks.push(
    ...result.snippets.map((entry, index) => snippetBlock(entry, `#${index + 1} `)),
    ...sourcesBlock(result.search, 8).slice(result.snippets.length),
  );
  blocks.push(
    'Next: read_code on the best reference; git_history action "pickaxe" with the message text shows when it appeared.',
  );
  return takeBlocks(blocks, budget).text;
}
