#!/usr/bin/env bun
/**
 * `bun run check:version [--base <ref>]`: package.json is the one source of the version (the MCP
 * serverInfo, /health and doctor read it), and CHANGELOG.md has to keep up with it.
 *
 * Always: the version is SemVer, and CHANGELOG.md has an `## [Unreleased]` section and a dated
 * `## [X.Y.Z] - YYYY-MM-DD` section for the current version.
 * With --base (CI passes the pull request base): a change to what users run (src/, assets/, the
 * runtime dependencies) must come with a CHANGELOG.md change, and a version change must go up.
 * Exit 0 in step, 1 out of step, 2 usage.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const RUNTIME = /^(src\/(?!.*__tests__\/)(?!testing\/)|assets\/)/;

function git(args: readonly string[]): string {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function versionOf(json: string): string {
  const parsed: unknown = JSON.parse(json);
  const version: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined;
  return typeof version === 'string' ? version : '';
}

function dependenciesOf(json: string): string {
  const parsed: unknown = JSON.parse(json);
  return JSON.stringify(
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'dependencies') : null,
  );
}

function compare(a: string, b: string): number {
  const [x, y] = [SEMVER.exec(a), SEMVER.exec(b)];
  for (const index of [1, 2, 3]) {
    const diff = Number(x?.[index] ?? 0) - Number(y?.[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function checkChangelog(version: string, changelog: string): string[] {
  const problems: string[] = [];
  if (!SEMVER.test(version)) problems.push(`package.json version "${version}" is not X.Y.Z.`);
  if (!changelog.includes('## [Unreleased]'))
    problems.push('CHANGELOG.md has no "## [Unreleased]" section.');
  const heading = new RegExp(
    `^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    'm',
  );
  if (!heading.test(changelog))
    problems.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section.`);
  return problems;
}

function checkAgainst(base: string, version: string): string[] {
  git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  const changed = git(['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .filter(Boolean);
  const basePackage = git(['show', `${base}:package.json`]);
  const current = readFileSync(join(ROOT, 'package.json'), 'utf8');
  const runtimeChanged =
    changed.some((path) => RUNTIME.test(path)) ||
    dependenciesOf(basePackage) !== dependenciesOf(current);
  const problems: string[] = [];
  if (runtimeChanged && !changed.includes('CHANGELOG.md'))
    problems.push(
      `Runtime code changed since ${base} but CHANGELOG.md did not: add an entry under [Unreleased].`,
    );
  const before = versionOf(basePackage);
  if (before !== version && compare(version, before) <= 0)
    problems.push(`The version went from ${before} to ${version}; it may only go up.`);
  return problems;
}

function main(): number {
  const args = process.argv.slice(2);
  const base = args[0] === '--base' ? args[1] : undefined;
  if (args.length > 0 && !base) {
    console.error('usage: bun scripts/check/version-sync.ts [--base <ref>]');
    return 2;
  }
  const version = versionOf(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const problems = checkChangelog(version, readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'));
  if (base) problems.push(...checkAgainst(base, version));
  for (const problem of problems) console.log(`FAIL: ${problem}`);
  if (problems.length === 0)
    console.log(
      `version-sync: ${version} is in step with CHANGELOG.md${base ? ` (against ${base})` : ''}.`,
    );
  return problems.length === 0 ? 0 : 1;
}

process.exit(main());
