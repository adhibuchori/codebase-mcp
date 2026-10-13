#!/usr/bin/env node
/**
 * README.md and README.id.md are one document in two languages (English and Bahasa Indonesia).
 * A pull request that changes one must change the other, so neither falls behind.
 *
 *   node scripts/check/readme-pair.mjs --base <ref>   compare HEAD with <ref> (CI passes the PR base)
 *   node scripts/check/readme-pair.mjs --staged       compare the staged changes (pre-commit)
 *   --root DIR                                        the repository to read (default: this script's)
 *
 * Node 20 or newer, no dependencies. Exit 0 both changed or neither, 1 only one changed, 2 usage or
 * a base it cannot diff against.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAIR = ['README.md', 'README.id.md'];

function usage(message) {
  console.error(`readme-pair: ${message}`);
  console.error('usage: node scripts/check/readme-pair.mjs (--base <ref> | --staged) [--root DIR]');
  process.exit(2);
}

const argv = process.argv.slice(2);
let base = null;
let staged = false;
let root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--base') base = argv[++i] ?? usage('--base needs a ref');
  else if (argv[i] === '--staged') staged = true;
  else if (argv[i] === '--root') root = resolve(argv[++i] ?? usage('--root needs a folder'));
  else usage(`unknown argument ${argv[i]}`);
}
if (!staged && (base === null || base === '' || base.startsWith('-'))) usage('--base needs a ref');
const since = staged ? 'in the staged changes' : `since ${base}`;

let changed;
try {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const names = staged
    ? git('diff', '--cached', '--name-only', '--', ...PAIR)
    : (git('rev-parse', '--verify', '--quiet', `${base}^{commit}`), git('diff', '--name-only', `${base}...HEAD`, '--', ...PAIR));
  changed = new Set(names.split('\n').filter(Boolean));
} catch {
  usage(`cannot diff against ${base} (fetch it, or check out with fetch-depth: 0)`);
}

const [en, id] = PAIR.map((f) => changed.has(f));
if (en !== id) {
  const [did, missing] = en ? PAIR : [...PAIR].reverse();
  console.log(`FAIL: ${did} changed ${since} but ${missing} did not. Update both in the same change.`);
  process.exit(1);
}
console.log(`readme-pair: ${en ? 'both READMEs changed' : 'neither README changed'} ${since}; in step`);
