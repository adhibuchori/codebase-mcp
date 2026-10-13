/** Starting the tunnel program in the foreground, and checking that a program exists. */
import { spawn, spawnSync } from 'node:child_process';

export function hasCommand(command: string, versionArg: string): boolean {
  return spawnSync(command, [versionArg], { stdio: 'ignore' }).error === undefined;
}

/** Ctrl+C belongs to the tunnel program while it runs; this script only waits for it to exit. */
function ignoreInterrupt(): void {}

/**
 * Runs a program with the terminal attached. On a Mac, caffeinate keeps the machine awake only
 * while the tunnel is open. Ctrl+C reaches the program too; this script waits for it to exit.
 */
export function runForeground(
  command: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<number> {
  const [bin, argv] =
    process.platform === 'darwin' ? ['caffeinate', ['-i', command, ...args]] : [command, [...args]];
  process.on('SIGINT', ignoreInterrupt);
  return new Promise((resolve) => {
    spawn(bin, argv, { stdio: 'inherit', env }).on('exit', (code) => {
      process.off('SIGINT', ignoreInterrupt);
      resolve(code ?? 0);
    });
  });
}

export async function serverIsUp(localUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${localUrl}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
