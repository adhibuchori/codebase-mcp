#!/usr/bin/env bun
/**
 * `bun run doctor`: checks everything the server needs, on Mac and Windows alike — runtime, API key,
 * config and repos, ripgrep, git, SQLite, grammars, the running server and the tunnel tool — and says
 * how to fix what is missing. Exit code 1 when a check fails.
 */
import { loadEnvFile, PROJECT_DIR } from '../shared/env-file.ts';
import {
  apiKeyCheck,
  gitCheck,
  grammarsCheck,
  reposCheck,
  ripgrepCheck,
  runtimeCheck,
  serverCheck,
  sqliteCheck,
  tunnelCheck,
  type Check,
} from './checks.ts';

loadEnvFile();

const ICON = { ok: '✅', warn: '⚠️ ', fail: '❌' } as const;
const checks: Check[] = [
  runtimeCheck(),
  apiKeyCheck(),
  ...(await reposCheck(PROJECT_DIR)),
  await ripgrepCheck(PROJECT_DIR),
  gitCheck(),
  await sqliteCheck(),
  grammarsCheck(PROJECT_DIR),
  await serverCheck(),
  tunnelCheck(),
];

for (const item of checks)
  console.log(`${ICON[item.level]} ${item.label.padEnd(9)} ${item.detail}`);
const failed = checks.filter((item) => item.level === 'fail').length;
console.log(failed > 0 ? `\n${failed} check(s) failed.` : '\nReady.');
process.exit(failed > 0 ? 1 : 0);
