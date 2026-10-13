/**
 * Ruby, tier 2: regex fallbacks for classes, modules and methods, Rails and Sinatra routes, the
 * frameworks a Gemfile lists, and the logger and raise statements that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { rubyRoutes } from './routes.ts';

const GEMFILE = /(?:^|\/)Gemfile$/;

export const rubyPack: LanguagePack = {
  id: 'ruby',
  name: 'Ruby',
  tier: 2,
  extensions: ['.rb', '.rake'],
  fileNames: ['Gemfile', 'Rakefile'],
  grammar: 'ruby',
  symbolPatterns: [
    { kind: 'class', regex: /^\s*class\s+([A-Z][\w:]*)/ },
    { kind: 'module', regex: /^\s*module\s+([A-Z][\w:]*)/ },
    { kind: 'function', regex: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/ },
  ],
  routeExtractors: [rubyRoutes],
  frameworks: [
    { file: GEMFILE, contains: /^\s*gem\s+["']rails["']/m, name: 'rails' },
    { file: GEMFILE, contains: /^\s*gem\s+["']sinatra["']/m, name: 'sinatra' },
  ],
  logCall:
    /\b(?:Rails\.logger|logger|log)\.(?:debug|info|warn|error|fatal|unknown)\b|\braise\s+(?:[A-Z]|["'])/,
};
