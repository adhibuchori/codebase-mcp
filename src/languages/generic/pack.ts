/**
 * The fallback packs. `genericPack` reads any text file no other pack claims, with line-anchored
 * patterns for the definition shapes most languages share (`function name`, `def name`, `class
 * Name`, `sub name`…), so a language without a pack still gets an outline. `configPack` covers
 * build, deploy and data files: searchable text whose only symbols are SQL tables.
 */
import type { LanguagePack, SymbolPattern } from '../../core/model/language-pack.types.ts';

/** Up to two leading modifiers (`export async function`, `public static function`). */
const MODIFIER =
  '(?:(?:public|private|protected|internal|export|default|abstract|final|static|async|pub|local|sealed|open|data|inline)\\s+)?';

function definition(keywords: string, kind: string): SymbolPattern {
  return {
    kind,
    regex: new RegExp(`^\\s*${MODIFIER}${MODIFIER}(?:${keywords})\\s+([A-Za-z_]\\w*)`),
  };
}

export const genericPack: LanguagePack = {
  id: 'generic',
  name: 'Other',
  tier: 3,
  extensions: [],
  symbolPatterns: [
    definition('function|def|fn|func|sub|proc', 'function'),
    definition('class', 'class'),
    definition('interface', 'interface'),
    definition('struct', 'struct'),
    definition('module', 'module'),
  ],
};

export const configPack: LanguagePack = {
  id: 'config',
  name: 'Config',
  tier: 3,
  extensions: [
    '.yml',
    '.yaml',
    '.json',
    '.xml',
    '.properties',
    '.toml',
    '.ini',
    '.conf',
    '.env.example',
    '.tf',
    '.hcl',
    '.sql',
    '.gradle',
    '.sh',
    '.bash',
    '.ps1',
    '.md',
  ],
  fileNames: ['Dockerfile', 'Makefile', 'Jenkinsfile', 'docker-compose.yml'],
  symbolPatterns: [
    {
      kind: 'table',
      regex:
        /^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:[`"[]?\w+[`"\]]?\.)?[`"[]?(\w+)/i,
    },
  ],
};
