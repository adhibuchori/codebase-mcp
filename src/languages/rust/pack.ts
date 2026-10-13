/**
 * Rust, tier 2: regex fallbacks for functions, structs, enums, traits, impl blocks (the functions
 * inside become methods of the implemented type) and modules, the web and gRPC crates Cargo.toml
 * depends on, and the log, error and panic macros that rank log-source candidates.
 */
import type { FrameworkRule, LanguagePack } from '../../core/model/language-pack.types.ts';
import { escapeRegex } from '../../core/security/safe-regex.ts';

const CARGO_TOML = /(?:^|\/)Cargo\.toml$/;
const VISIBILITY = String.raw`(?:pub(?:\([^)]*\))?\s+)?`;

/** `axum = "0.7"`, `axum = { version = … }` or a `[dependencies.axum]` table. */
function crate(name: string): FrameworkRule {
  const key = escapeRegex(name);
  return {
    file: CARGO_TOML,
    contains: new RegExp(`^\\s*(?:\\[(?:dev-)?dependencies\\.)?${key}\\s*[=\\]]`, 'm'),
    name,
  };
}

export const rustPack: LanguagePack = {
  id: 'rust',
  name: 'Rust',
  tier: 2,
  extensions: ['.rs'],
  grammar: 'rust',
  symbolPatterns: [
    {
      kind: 'function',
      regex: new RegExp(
        String.raw`^\s*${VISIBILITY}(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+(?:"[^"]*"\s+)?)?fn\s+([A-Za-z_]\w*)`,
      ),
    },
    { kind: 'struct', regex: new RegExp(String.raw`^\s*${VISIBILITY}struct\s+([A-Za-z_]\w*)`) },
    { kind: 'enum', regex: new RegExp(String.raw`^\s*${VISIBILITY}enum\s+([A-Za-z_]\w*)`) },
    {
      kind: 'trait',
      regex: new RegExp(String.raw`^\s*${VISIBILITY}(?:unsafe\s+)?trait\s+([A-Za-z_]\w*)`),
    },
    {
      kind: 'impl',
      regex:
        /^\s*(?:unsafe\s+)?impl\b(?:\s*<[^>]*>)?\s+(?:[\w:]+(?:<[^>]*>)?\s+for\s+)?([A-Za-z_]\w*)/,
    },
    { kind: 'module', regex: new RegExp(String.raw`^\s*${VISIBILITY}mod\s+([A-Za-z_]\w*)`) },
  ],
  frameworks: [crate('actix-web'), crate('axum'), crate('rocket'), crate('tonic')],
  logCall:
    /\b(?:error|warn|info|debug|trace|panic|anyhow|bail|eyre|unreachable|unimplemented|todo)!\(|\.expect\(\s*"/,
};
