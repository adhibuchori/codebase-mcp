/** Text for repo_overview, in three levels of detail so it always fits the budget. */
import { pickLevel } from '../../core/output/budget.ts';
import type { RouteHit } from '../../core/model/domain.types.ts';
import { keyFiles, renderTree } from '../../engine/repo-tree.ts';
import { languageLabel, statusLabel } from './repos.format.ts';
import type { Overview } from './repos.service.ts';

function routeSummary(routes: readonly RouteHit[], max: number): string[] {
  const http = routes
    .filter((r) => r.kind === 'http' && r.role === 'handler')
    .map((r) => `${r.method} ${r.pattern}`);
  const consumes = [
    ...new Set(
      routes.filter((r) => r.kind === 'topic' && r.role === 'consumer').map((r) => r.pattern),
    ),
  ];
  const produces = [
    ...new Set(
      routes.filter((r) => r.kind === 'topic' && r.role === 'producer').map((r) => r.pattern),
    ),
  ];
  const lines: string[] = [];
  if (http.length > 0)
    lines.push(
      `Endpoints (${http.length}): ${http.slice(0, max).join(', ')}${http.length > max ? ', …' : ''}`,
    );
  if (consumes.length > 0) lines.push(`Consumes topics: ${consumes.slice(0, max).join(', ')}`);
  if (produces.length > 0) lines.push(`Produces topics: ${produces.slice(0, max).join(', ')}`);
  return lines;
}

function facts(overview: Overview): string[] {
  const { card } = overview;
  const repo = card.repo;
  const frameworks = card.frameworks.join(', ') || 'no framework detected';
  const lines = [
    `${repo.slug}${repo.group ? ` (group ${repo.group})` : ''} · ${languageLabel(card)} · ${frameworks} · ${card.files} files · index ${statusLabel(card.status)}`,
  ];
  if (card.lastCommit)
    lines.push(
      `Last commit: ${card.lastCommit.date} ${card.lastCommit.sha} ${card.lastCommit.author}: ${card.lastCommit.subject}`,
    );
  return lines;
}

export function renderOverview(overview: Overview, depth: number, budget: number): string {
  const slug = overview.card.repo.slug;
  const render = (width: number, levels: number) => () =>
    [
      ...facts(overview),
      `Key files: ${keyFiles(overview.paths, width * 2).join(', ') || 'none found'}`,
      ...routeSummary(overview.routes, width),
      `Folders${overview.folder ? ` under ${overview.folder}/` : ''} (files below each):`,
      ...renderTree(overview.tree, { depth: levels, width, indent: '  ' }),
      `Next: read_code "${slug}/<path>" (mode "outline" for big files), or search_code with repos ["${slug}"].`,
    ].join('\n');
  return pickLevel([render(12, depth), render(8, Math.min(depth, 2)), render(5, 1)], budget);
}
