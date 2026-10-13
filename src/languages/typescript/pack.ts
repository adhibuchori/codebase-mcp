/**
 * TypeScript, tier 1: one tree-sitter grammar for .ts/.mts/.cts and another for .tsx. The regex
 * fallbacks add interfaces, enums, type aliases and namespaces to the JavaScript shapes; routes,
 * frameworks (from package.json) and log calls are the Node ones the JavaScript pack uses too.
 */
import type { LanguagePack, SymbolPattern } from '../../core/model/language-pack.types.ts';
import { nodeFrameworks, nodeLogCall } from '../node/frameworks.ts';
import { nodeRoutes } from '../node/routes.ts';
import { jsSymbolPatterns } from '../node/symbols.ts';

const typeSymbols: readonly SymbolPattern[] = [
  { kind: 'interface', regex: /^\s*(?:export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  {
    kind: 'enum',
    regex: /^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/,
  },
  { kind: 'type', regex: /^\s*(?:export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[<=]/ },
  { kind: 'module', regex: /^\s*(?:export\s+)?(?:declare\s+)?namespace\s+([A-Za-z_$][\w$.]*)/ },
];

const shared: Omit<LanguagePack, 'id' | 'name' | 'extensions' | 'grammar'> = {
  tier: 1,
  symbolPatterns: [...jsSymbolPatterns, ...typeSymbols],
  routeExtractors: [nodeRoutes],
  frameworks: nodeFrameworks,
  logCall: nodeLogCall,
};

export const typescriptPack: LanguagePack = {
  ...shared,
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts', '.mts', '.cts'],
  grammar: 'typescript',
};

export const tsxPack: LanguagePack = {
  ...shared,
  id: 'tsx',
  name: 'TypeScript (TSX)',
  extensions: ['.tsx'],
  grammar: 'tsx',
};
