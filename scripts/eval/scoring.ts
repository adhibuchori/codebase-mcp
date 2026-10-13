/**
 * Eval scoring: the references a tool answer names, in order, and whether an expected one is among
 * the first `within` of them. A reference is "repo/path" or "repo/path:line".
 */
export interface Scenario {
  readonly id: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly expect: readonly string[];
  readonly within: number;
}

export interface Outcome {
  readonly id: string;
  readonly hit1: boolean;
  readonly hitK: boolean;
  readonly tokens: number;
  readonly ms: number;
  readonly error: boolean;
}

const REF = /([A-Za-z0-9._-]+\/[A-Za-z0-9._\-/]+\.[A-Za-z0-9]+)(?::(\d+))?/g;

/**
 * Distinct file references in order of appearance, each with the first line number seen: on the
 * reference itself ("repo/path:12"), or on the line below a bare path ("repo/path" then "  12: …").
 */
export function references(text: string): { file: string; line: number }[] {
  const seen = new Map<string, number>();
  const rows = text.split('\n');
  rows.forEach((row, index) => {
    for (const match of row.matchAll(REF)) {
      const file = match[1] ?? '';
      const below = /^\s+>?\s*(\d+):/.exec(rows[index + 1] ?? '')?.[1];
      if (!seen.has(file)) seen.set(file, Number(match[2] ?? below ?? 0));
    }
  });
  return [...seen].map(([file, line]) => ({ file, line }));
}

function hits(expected: string, ref: { file: string; line: number }): boolean {
  const [file, line] = expected.split(':');
  if (ref.file !== file) return false;
  return line === undefined || Math.abs(ref.line - Number(line)) <= 3;
}

export function score(
  scenario: Scenario,
  answer: { text: string; isError: boolean; ms: number },
): Outcome {
  const refs = references(answer.text);
  const found = (count: number): boolean =>
    refs.slice(0, count).some((ref) => scenario.expect.some((expected) => hits(expected, ref)));
  return {
    id: scenario.id,
    hit1: found(1),
    hitK: found(scenario.within),
    tokens: Math.ceil(answer.text.length / 4),
    ms: answer.ms,
    error: answer.isError,
  };
}

export function percentile(values: readonly number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

export function summary(outcomes: readonly Outcome[]): string {
  const rate = (pick: (o: Outcome) => boolean): string =>
    `${Math.round((outcomes.filter(pick).length / Math.max(1, outcomes.length)) * 100)}%`;
  const tokens = outcomes.map((o) => o.tokens);
  const ms = outcomes.map((o) => o.ms);
  return [
    `| Scenarios | hit@1 | hit@k | mean tokens | p50 ms | p95 ms |`,
    `| --- | --- | --- | --- | --- | --- |`,
    `| ${outcomes.length} | ${rate((o) => o.hit1)} | ${rate((o) => o.hitK)} | ${Math.round(tokens.reduce((a, b) => a + b, 0) / Math.max(1, tokens.length))} | ${percentile(ms, 50)} | ${percentile(ms, 95)} |`,
  ].join('\n');
}
