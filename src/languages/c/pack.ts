/**
 * C, tier 2: regex fallbacks for structs, unions, enums, typedefs and function definitions. A
 * definition starts at column 0 and its line has no `;`, which tells it from a prototype; the
 * return type may also sit alone on the line above (GNU style).
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';

export const cPack: LanguagePack = {
  id: 'c',
  name: 'C',
  tier: 2,
  extensions: ['.c', '.h'],
  grammar: 'c',
  symbolPatterns: [
    { kind: 'struct', regex: /^\s*(?:typedef\s+)?(?:struct|union)\s+([A-Za-z_]\w*)\s*(?:\{|$)/ },
    { kind: 'enum', regex: /^\s*(?:typedef\s+)?enum\s+([A-Za-z_]\w*)\s*(?:\{|$)/ },
    { kind: 'type', regex: /^\s*typedef\s+[^;(]*?\b([A-Za-z_]\w*)\s*;/ },
    { kind: 'type', regex: /^\}\s*([A-Za-z_]\w*)\s*;/ },
    { kind: 'function', regex: /^[A-Za-z_][\w \t*]*[\s*]([A-Za-z_]\w*)\s*\([^;]*$/ },
    { kind: 'function', regex: /^([A-Za-z_]\w*)\s*\([^;]*$/ },
  ],
  logCall: /\bfprintf\s*\(\s*stderr\b|\bperror\s*\(|\bsyslog\s*\(|\babort\s*\(/,
};
