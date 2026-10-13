/**
 * Finds a ripgrep that actually runs: RG_PATH when set, then the binary @vscode/ripgrep installs
 * for this platform (a plain npm package, no download), then `rg` on PATH. A locked-down machine may
 * block binaries inside node_modules; then this returns null and search falls back to JavaScript.
 */
import { spawnCollect } from '../process/spawn-collect.ts';

export interface LocateOptions {
  /** RG_PATH from the environment ("" when unset). */
  readonly configured: string;
  /** True when ripgrep must not be used (CODEBASE_NO_RIPGREP=1), e.g. to test the fallback. */
  readonly disabled: boolean;
  /** The path @vscode/ripgrep reports, or null when the package is missing. */
  readonly bundled: () => Promise<string | null>;
  readonly cwd: string;
}

export async function ripgrepVersion(path: string, cwd: string): Promise<string | null> {
  const result = await spawnCollect(path, ['--version'], { cwd, maxBytes: 4096, timeoutMs: 5000 });
  const first = result.stdout.split('\n')[0] ?? '';
  return result.code === 0 && first.startsWith('ripgrep') ? first : null;
}

type RipgrepModule = { readonly rgPath: string };

/** The binary @vscode/ripgrep ships for this platform, or null when the package is missing. */
export async function bundledRipgrep(
  load: () => Promise<RipgrepModule> = () => import('@vscode/ripgrep'),
): Promise<string | null> {
  try {
    return (await load()).rgPath;
  } catch {
    return null;
  }
}

export async function locateRipgrep(options: LocateOptions): Promise<string | null> {
  if (options.disabled) return null;
  const candidates = [options.configured, await options.bundled(), 'rg'].filter(
    (path): path is string => Boolean(path),
  );
  const versions = await Promise.all(candidates.map((path) => ripgrepVersion(path, options.cwd)));
  const index = versions.findIndex((version) => version !== null);
  return index >= 0 ? (candidates[index] ?? null) : null;
}
