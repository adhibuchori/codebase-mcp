/**
 * Elixir, tier 2: regex fallbacks for modules, protocols, implementations and functions (public,
 * private, macros, guards), Phoenix router routes, the Phoenix dependency in mix.exs, and the
 * Logger and raise calls that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { elixirRoutes } from './routes.ts';

export const elixirPack: LanguagePack = {
  id: 'elixir',
  name: 'Elixir',
  tier: 2,
  extensions: ['.ex', '.exs'],
  grammar: 'elixir',
  symbolPatterns: [
    { kind: 'module', regex: /^\s*defmodule\s+([A-Z][\w.]*)/ },
    { kind: 'interface', regex: /^\s*defprotocol\s+([A-Z][\w.]*)/ },
    { kind: 'module', regex: /^\s*defimpl\s+([A-Z][\w.]*)/ },
    {
      kind: 'function',
      regex:
        /^\s*(?:def|defp|defmacro|defmacrop|defguard|defguardp|defdelegate)\s+([a-z_]\w*[?!]?)/,
    },
  ],
  routeExtractors: [elixirRoutes],
  frameworks: [{ file: /(?:^|\/)mix\.exs$/, contains: /\{:phoenix,/, name: 'phoenix' }],
  logCall:
    /\bLogger\.(?:debug|info|notice|warning|warn|error|critical|alert|emergency)\b|\braise\s+(?:[A-Z]|")/,
};
