/**
 * ripgrep arguments. --no-config ignores a user's RIPGREP_CONFIG_PATH, -e keeps a pattern that
 * starts with "-" from being read as a flag, and secret files are excluded by glob here and again by
 * name after parsing (defence in depth).
 */
import type { TextQuery } from '../../ports/search.ts';

const SECRET_GLOBS = [
  '!.git/',
  '!**/node_modules/**',
  '!**/.env',
  '!**/.env.*',
  '!**/.env-*',
  '!**/.env_*',
  '!**/.envrc',
  '!**/*.env',
  '!**/*.pem',
  '!**/*.key',
  '!**/*.p12',
  '!**/*.pfx',
  '!**/*.jks',
  '!**/*.keystore',
  '!**/id_rsa*',
  '!**/id_dsa*',
  '!**/id_ecdsa*',
  '!**/id_ed25519*',
  '!**/.npmrc',
  '!**/.pypirc',
  '!**/.netrc',
  '!**/*credentials*',
  '!**/*secret*',
  '!**/.git-credentials',
  '!**/google-services.json',
  '!**/googleservice-info.plist',
  '!**/application-prod.*',
  '!**/application-production.*',
];

export interface RipgrepArgOptions {
  readonly maxFileBytes: number;
  /** Globs of files never searched (config `exclude`). */
  readonly exclude: readonly string[];
}

export function ripgrepArgs(query: TextQuery, options: RipgrepArgOptions): string[] {
  const args = ['--json', '--no-config', '--hidden', '--no-messages'];
  args.push(
    '--max-filesize',
    String(options.maxFileBytes),
    '--max-count',
    String(query.maxPerFile),
  );
  args.push(query.caseSensitive ? '--case-sensitive' : '--ignore-case');
  if (query.mode !== 'regex') args.push('--fixed-strings');
  if (query.mode === 'word') args.push('--word-regexp');
  for (const glob of SECRET_GLOBS) args.push('--iglob', glob);
  for (const glob of options.exclude) args.push('--glob', `!${glob}`);
  if (query.pathGlob) args.push('--iglob', query.pathGlob);
  args.push('-e', query.pattern);
  return args;
}
