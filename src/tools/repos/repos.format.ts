/** Text for list_repos and repo_overview: one compact line per fact, no JSON. */
import { plural } from '../../core/output/trim.ts';
import type { RepoCard } from '../../engine/catalog.ts';
import type { IndexStatus } from '../../ports/index-store.ts';

export function statusLabel(status: IndexStatus): string {
  if (status.state === 'indexing') return `indexing ${Math.round(status.progress * 100)}%`;
  if (status.state === 'missing') return 'not indexed';
  return status.state;
}

export function languageLabel(card: RepoCard): string {
  const total = card.languages.reduce((sum, language) => sum + language.files, 0);
  if (total === 0) return 'no code';
  return card.languages
    .slice(0, 3)
    .map((language) => `${language.id} ${Math.round((language.files / total) * 100)}%`)
    .join(', ');
}

function counts(card: RepoCard): string {
  const parts = [plural(card.files, 'file')];
  if (card.endpoints > 0) parts.push(plural(card.endpoints, 'endpoint'));
  if (card.topics > 0) parts.push(plural(card.topics, 'topic'));
  if (card.grpc > 0) parts.push(plural(card.grpc, 'gRPC service'));
  return parts.join(' · ');
}

/** Detail 2: everything. 1: no commit subject and frameworks. 0: name, languages and state only. */
function cardLine(card: RepoCard, detail: 0 | 1 | 2): string {
  const head = `- ${card.repo.slug}  ${languageLabel(card)}`;
  if (detail === 0) return `${head} · ${statusLabel(card.status)}`;
  const frameworks =
    detail === 2 && card.frameworks.length > 0 ? ` · ${card.frameworks.join(', ')}` : '';
  const commit =
    detail === 2 && card.lastCommit
      ? ` · ${card.lastCommit.date} "${card.lastCommit.subject.slice(0, 60)}"`
      : '';
  return `${head}${frameworks} · ${counts(card)}${commit} · ${statusLabel(card.status)}`;
}

/** Cards grouped under "[group]" headers, groups in name order, ungrouped repos last. */
export function groupedLines(cards: readonly RepoCard[], detail: 0 | 1 | 2): string[] {
  const groups = new Map<string, RepoCard[]>();
  for (const card of cards) {
    const list = groups.get(card.repo.group) ?? [];
    list.push(card);
    groups.set(card.repo.group, list);
  }
  const names = [...groups.keys()].toSorted((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );
  const showHeaders = names.length > 1 || (names[0] ?? '') !== '';
  const lines: string[] = [];
  for (const name of names) {
    if (showHeaders) lines.push(`[${name || 'no group'}]`);
    for (const card of groups.get(name) ?? []) lines.push(cardLine(card, detail));
  }
  return lines;
}
