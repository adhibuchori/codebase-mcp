/**
 * Swift, tier 3: no grammar, so outlines come from these regexes alone. A declaration keyword may
 * follow any attributes and modifiers (`@MainActor public final class`), but nothing that marks an
 * expression or a comment (`=`, braces, quotes, slashes). Extensions are reported as impl blocks:
 * the functions inside them belong to the extended type.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';

export const swiftPack: LanguagePack = {
  id: 'swift',
  name: 'Swift',
  tier: 3,
  extensions: ['.swift'],
  symbolPatterns: [
    { kind: 'class', regex: /^[^={}"/]*?\bclass\s+(?!func\b|var\b|let\b)([A-Za-z_]\w*)/ },
    { kind: 'struct', regex: /^[^={}"/]*?\bstruct\s+([A-Za-z_]\w*)/ },
    { kind: 'enum', regex: /^[^={}"/]*?\benum\s+([A-Za-z_]\w*)/ },
    { kind: 'interface', regex: /^[^={}"/]*?\bprotocol\s+([A-Za-z_]\w*)/ },
    { kind: 'impl', regex: /^[^={}"/]*?\bextension\s+([A-Za-z_][\w.]*)/ },
    { kind: 'function', regex: /^[^={}"/]*?\bfunc\s+([A-Za-z_]\w*)/ },
  ],
  frameworks: [
    { file: /(?:^|\/)Package\.swift$/, contains: /github\.com\/vapor\/vapor\b/, name: 'vapor' },
  ],
  logCall:
    /\b(?:logger|log)\.(?:debug|info|notice|warning|error|critical|fault)\(|\bos_log\(|\bfatalError\(|\bthrow\s+[A-Z]\w*/,
};
