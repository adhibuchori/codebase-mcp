/**
 * JavaScript, tier 1, for ES modules, CommonJS and JSX. It shares the Node routes, frameworks
 * (from package.json), log-call shape and regex fallback symbols with the TypeScript packs.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { nodeFrameworks, nodeLogCall } from '../node/frameworks.ts';
import { nodeRoutes } from '../node/routes.ts';
import { jsSymbolPatterns } from '../node/symbols.ts';

export const javascriptPack: LanguagePack = {
  id: 'javascript',
  name: 'JavaScript',
  tier: 1,
  extensions: ['.js', '.mjs', '.cjs', '.jsx'],
  grammar: 'javascript',
  symbolPatterns: jsSymbolPatterns,
  routeExtractors: [nodeRoutes],
  frameworks: nodeFrameworks,
  logCall: nodeLogCall,
};
