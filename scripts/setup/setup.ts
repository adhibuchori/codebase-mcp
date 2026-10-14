#!/usr/bin/env bun
/**
 * `bun run setup`: makes sure .env has a strong MCP_API_KEY (the key itself is never printed), then
 * sets up which repos are served.
 * - REPOS set in .env (or --repo given): REPOS decides, so setup shows it and adds the repos you
 *   name to it. Non-interactive: bun run setup --repo ~/work/orders-api [--repo name=D:/code/web]
 * - Otherwise: it finds the git repos under the folder(s) you name and writes codebase.config.json.
 *   Non-interactive: bun run setup --root ~/work [--root D:/code] --yes
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { createNodeFileSystem } from '../../src/adapters/fs/node-file-system.ts';
import { discoverRepos } from '../../src/config/discover-repos.ts';
import { parseReposEnv } from '../../src/config/load-config.ts';
import { expandHome } from '../../src/config/repo-registry.ts';
import { loadEnvFile, PROJECT_DIR } from '../shared/env-file.ts';
import { ensureApiKey, type FileOps } from './api-key.ts';
import { addRepos, parseRepoInput } from './repos-env.ts';

loadEnvFile();
const args = process.argv.slice(2);
const yes = args.includes('--yes');
const valuesOf = (flag: string): string[] =>
  args.flatMap((arg, index) => (arg === flag && args[index + 1] ? [args[index + 1] ?? ''] : []));
const roots = valuesOf('--root');
const repoArgs = valuesOf('--repo');
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
const files: FileOps = {
  read: (path) => readFileSync(path, 'utf8'),
  write: writeFileSync,
  exists: existsSync,
};
const envFiles = { env: join(PROJECT_DIR, '.env'), example: join(PROJECT_DIR, '.env.example') };

async function ask(question: string, fallback: string): Promise<string> {
  if (yes) return fallback;
  const answer = (await prompt.question(`${question}${fallback ? ` [${fallback}]` : ''} `)).trim();
  return answer || fallback;
}

/** REPOS mode: list what REPOS serves, then add the git repos the user names. */
async function updateRepos(listed: readonly { name: string; path: string }[]): Promise<void> {
  console.log(
    listed.length > 0
      ? `REPOS in .env decides which repos are served (${listed.length}):`
      : 'REPOS in .env is not set yet; from now on it lists the repos that are served.',
  );
  for (const repo of listed) console.log(`  • ${repo.name} = ${repo.path}`);
  const input =
    repoArgs.length > 0
      ? repoArgs.join(';')
      : await ask(
          '\nAdd repos? (a folder, or name=folder; several: separate with ";"; Enter to skip)',
          '',
        );
  const repos = [];
  for (const { name, path } of parseRepoInput(input)) {
    const folder = resolve(expandHome(path, homedir()));
    if (existsSync(join(folder, '.git'))) repos.push({ name, path: folder });
    else console.log(`⚠️  Skipped ${folder}: not a git repo`);
  }
  const { added, alreadyListed } = addRepos(envFiles, repos, files);
  for (const path of alreadyListed) console.log(`   Already in REPOS: ${path}`);
  if (added.length === 0) {
    console.log('\nREPOS unchanged.');
    return;
  }
  console.log(`\n✅ Added to REPOS in .env: ${added.map((repo) => repo.name).join(', ')}`);
  console.log('   Restart bun start to serve them.');
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

/** Folder mode: find the repos under the chosen folders and write codebase.config.json. */
async function writeFolders(): Promise<void> {
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
}

async function main(): Promise<void> {
  console.log(`✅ ${ensureApiKey(envFiles.env, envFiles.example, files)}\n`);
  const listed = parseReposEnv(process.env['REPOS'] ?? '');
  if (listed.length > 0 || repoArgs.length > 0) await updateRepos(listed);
  else await writeFolders();
  console.log(
    '\nNext: bun start (the server), then bun tunnel (in another terminal). bun run doctor checks everything.',
  );
}

try {
  await main();
} finally {
  prompt.close();
}
