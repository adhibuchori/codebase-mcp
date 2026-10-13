/**
 * PHP, tier 2: regex fallbacks for classes, interfaces, traits, enums and functions (methods once
 * the symbol tree nests them), Laravel and Symfony routes, the frameworks composer.json requires,
 * and the Log facade, PSR-3 logger and throw statements that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { phpRoutes } from './routes.ts';

const COMPOSER_JSON = /(?:^|\/)composer\.json$/;

export const phpPack: LanguagePack = {
  id: 'php',
  name: 'PHP',
  tier: 2,
  extensions: ['.php'],
  grammar: 'php',
  symbolPatterns: [
    { kind: 'class', regex: /^\s*(?:abstract\s+|final\s+)?(?:readonly\s+)?class\s+([A-Za-z_]\w*)/ },
    { kind: 'interface', regex: /^\s*interface\s+([A-Za-z_]\w*)/ },
    { kind: 'trait', regex: /^\s*trait\s+([A-Za-z_]\w*)/ },
    { kind: 'enum', regex: /^\s*enum\s+([A-Za-z_]\w*)/ },
    { kind: 'function', regex: /^[\w \t]*?\bfunction\s+&?([A-Za-z_]\w*)/ },
  ],
  routeExtractors: [phpRoutes],
  frameworks: [
    { file: COMPOSER_JSON, contains: /"laravel\/framework"\s*:/, name: 'laravel' },
    { file: COMPOSER_JSON, contains: /"symfony\/framework-bundle"\s*:/, name: 'symfony' },
  ],
  logCall:
    /\bLog::(?:emergency|alert|critical|error|warning|notice|info|debug)\(|->logger->(?:emergency|alert|critical|error|warning|notice|info|debug|log)\(|\berror_log\(|\bthrow\s+new\s+\\?[A-Za-z_][\w\\]*\(/,
};
