#!/usr/bin/env bun
/**
 * `bun run setup`: first-time setup. Finds the git repos under the folder(s) you name, writes
 * codebase.config.json, and makes sure .env has a strong MCP_API_KEY (the key itself is never
 * printed). Non-interactive: bun run setup --root ~/work [--root D:/code] --yes
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { createNodeFileSystem } from '../../src/adapters/fs/node-file-system.ts';
import { discoverRepos } from '../../src/config/discover-repos.ts';
import { expandHome } from '../../src/config/repo-registry.ts';
import { parseReposEnv } from '../../src/config/load-config.ts';
import { loadEnvFile, PROJECT_DIR } from '../shared/env-file.ts';
import { ensureApiKey } from './api-key.ts';

loadEnvFile();
const args = process.argv.slice(2);
const yes = args.includes('--yes');
const roots = args.flatMap((arg, index) =>
  arg === '--root' && args[index + 1] ? [args[index + 1] ?? ''] : [],
);
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback: string): Promise<string> {
  if (yes) return fallback;
  const answer = (await prompt.question(`${question} [${fallback}] `)).trim();
  return answer || fallback;
}

async function chooseRoots(): Promise<string[]> {
  if (roots.length > 0) return roots;
  const suggestion = existsSync(join(homedir(), 'work')) ? '~/work' : resolve(PROJECT_DIR, '..');
  const answer = await ask(
    'Which folder holds your repos? (several: separate with ";")',
    suggestion,
  );
  return answer
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const fs = createNodeFileSystem();
  const chosen = await chooseRoots();
  const found = await Promise.all(
    chosen.map((root) =>
      discoverRepos(fs, { root: resolve(expandHome(root, homedir())), maxDepth: 3, exclude: [] }),
    ),
  );
  const repos = found.flat();
  console.log(`\nFound ${repos.length} git repos under ${chosen.join(', ')}:`);
  for (const repo of repos.slice(0, 15)) console.log(`  • ${repo}`);
  if (repos.length > 15) console.log(`  … and ${repos.length - 15} more`);
  if (repos.length === 0)
    console.log('  (none: point setup at the folder that contains your cloned repos)');
  const configPath = join(PROJECT_DIR, 'codebase.config.json');
  if (
    existsSync(configPath) &&
    (await ask('codebase.config.json exists. Replace it? (a .bak copy is kept) y/n', 'y')) !== 'y'
  )
    return;
  if (existsSync(configPath)) copyFileSync(configPath, `${configPath}.bak`);
  writeFileSync(
    configPath,
    `${JSON.stringify({ $schema: './codebase.config.schema.json', roots: chosen.map((path) => ({ path, maxDepth: 3 })) }, null, 2)}\n`,
  );
  console.log(`\n✅ Wrote ${configPath}`);
  if (parseReposEnv(process.env['REPOS'] ?? '').length > 0)
    console.log(
      '⚠️  REPOS is set in .env, so it decides which repos are served and these folders are skipped. Remove REPOS to use them.',
    );
  const keyNote = ensureApiKey(join(PROJECT_DIR, '.env'), join(PROJECT_DIR, '.env.example'), {
    read: (path) => readFileSync(path, 'utf8'),
    write: writeFileSync,
    exists: existsSync,
  });
  console.log(`✅ ${keyNote}`);
  console.log(
    '\nNext: bun start (the server), then bun tunnel (in another terminal). bun run doctor checks everything.',
  );
}

try {
  await main();
} finally {
  prompt.close();
}
