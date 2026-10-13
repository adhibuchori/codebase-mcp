/** File and folder names the server must never list, search, read or show in history: env files, keys, credentials. */

/** Any env file: .env, .env.local, .env.example, .env-prod, .env_backup, .envrc, prod.env, app.env.bak */
const ENV_FILE = /^\.env|\.env$|\.env\./;

const SENSITIVE: readonly RegExp[] = [
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /\.keystore$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /^\.npmrc$/,
  /^\.pypirc$/,
  /^\.netrc$/,
  /credentials/,
  /secret/,
  /^\.git-credentials$/,
  /^google-services\.json$/,
  /^googleservice-info\.plist$/,
  /^application-(prod|production)\.(ya?ml|properties)$/,
];

/** Windows opens ".env." and ".env " as ".env", and "name:stream" as "name", so check those forms too. */
function nameForms(name: string): string[] {
  const lower = name.toLowerCase();
  const trimmed = lower.replace(/[. ]+$/, '');
  return [lower, trimmed, trimmed.split(':')[0] ?? trimmed];
}

/** True if a single path segment (file or folder name) must not be listed, searched, or read. */
export function isSensitiveName(name: string, extraPatterns: readonly RegExp[] = []): boolean {
  return nameForms(name).some(
    (form) =>
      ENV_FILE.test(form) ||
      SENSITIVE.some((re) => re.test(form)) ||
      extraPatterns.some((re) => re.test(form)),
  );
}

/** Folders that hold dependencies, build output or VCS data: never walked or indexed. */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'bower_components',
  '.gradle',
  '.idea',
  '.vscode',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  'coverage',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.terraform',
  'Pods',
  'DerivedData',
]);

/** Folders that hold build output: skipped by the walker, but a tracked file inside one is still read. */
export const BUILD_DIRS: ReadonlySet<string> = new Set([
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
]);
