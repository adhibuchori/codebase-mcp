#!/usr/bin/env bun
/**
 * `bun run eval [scenario files…] [--config path] [--out file]`: runs debugging tasks through the real
 * tools and reports hit@1, hit@k, tokens and latency. Without a config it builds a git workspace from
 * the fixture repos, so it runs anywhere, CI included. Private scenarios (company repos) go in a
 * gitignored `*.private.json` file, run with --config pointing at your codebase.config.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestRuntime } from '../../src/testing/helpers/test-runtime.ts';
import { createWorkspace } from '../../src/testing/helpers/workspace.ts';
import { score, summary, type Outcome, type Scenario } from './scoring.ts';

const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const files = args.filter(
  (arg, index) => !arg.startsWith('--') && !['--config', '--out'].includes(args[index - 1] ?? ''),
);
const scenarioFiles =
  files.length > 0
    ? files
    : [
        join(
          import.meta.dirname,
          '..',
          '..',
          'tests',
          'fixtures',
          'eval',
          'fixture-scenarios.json',
        ),
      ];

function isScenario(value: unknown): value is Scenario {
  if (typeof value !== 'object' || value === null) return false;
  const fields = new Map(Object.entries(value));
  return (
    typeof fields.get('id') === 'string' &&
    typeof fields.get('tool') === 'string' &&
    Array.isArray(fields.get('expect'))
  );
}

function load(path: string): Scenario[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const list: unknown =
    typeof parsed === 'object' && parsed !== null && 'scenarios' in parsed ? parsed.scenarios : [];
  return Array.isArray(list) ? list.filter(isScenario) : [];
}

const scenarios = scenarioFiles.flatMap(load);
const workspace = createWorkspace();
const configPath = option('--config');
const runtime = await startTestRuntime(workspace, configPath ? { overrides: { configPath } } : {});
const outcomes: Outcome[] = [];
for (const scenario of scenarios) {
  const started = performance.now();
  /* Sequential on purpose: latency is measured one tool call at a time. */
  const answer = await runtime.call(scenario.tool, scenario.args);
  const outcome = score(scenario, { ...answer, ms: Math.round(performance.now() - started) });
  outcomes.push(outcome);
  console.log(
    `${outcome.hitK ? '✅' : '❌'} ${scenario.id.padEnd(26)} hit@1 ${outcome.hit1 ? 'yes' : 'no '} · ${String(outcome.tokens).padStart(5)} tokens · ${String(outcome.ms).padStart(4)} ms${outcome.error ? ' · tool error' : ''}`,
  );
}
await runtime.close();
workspace.cleanup();
const table = summary(outcomes);
console.log(`\n${table}`);
const out = option('--out');
if (out) writeFileSync(out, `${table}\n`);
process.exit(outcomes.every((outcome) => outcome.hitK) ? 0 : 1);
