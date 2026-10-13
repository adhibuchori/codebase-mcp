/** Compiles the config's extra sensitive-name patterns, turning a bad regex into a readable error. */
import { ConfigError } from '../config/load-config.ts';

export function compileBlocked(patterns: readonly string[]): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern, 'i');
    } catch (error) {
      throw new ConfigError(
        `blocked pattern "${pattern}" is not a valid regex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}
