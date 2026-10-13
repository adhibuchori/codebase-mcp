/**
 * Dart, tier 3: no grammar, so outlines come from these regexes alone: classes (with Dart 3
 * modifiers), mixins, named extensions (impl blocks of the extended type), enums, and functions or
 * methods, which are told from calls by a body (`{` or `=>`) after a parameter list without nested
 * parentheses (`setState(() {` is a call).
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';

export const dartPack: LanguagePack = {
  id: 'dart',
  name: 'Dart',
  tier: 3,
  extensions: ['.dart'],
  symbolPatterns: [
    { kind: 'class', regex: /^[\w \t]*?\bclass\s+([A-Za-z_$][\w$]*)/ },
    { kind: 'class', regex: /^\s*(?:base\s+)?mixin\s+([A-Za-z_$][\w$]*)/ },
    { kind: 'impl', regex: /^\s*extension\s+([A-Za-z_$][\w$]*)\s+on\b/ },
    { kind: 'enum', regex: /^\s*enum\s+([A-Za-z_$][\w$]*)/ },
    {
      /* No two whitespace quantifiers meet, so a long blank run is read one way only (linear). */
      kind: 'function',
      regex:
        /^[\w<>?,\s]*?\b(?!(?:if|for|while|switch|catch|return|else)\b)([a-z_$][\w$]*)\s*(?:<[^>]*>\s*)?\([^;()]*\)\s*(?:(?:async\*?|sync\*)\s*)?(?:\{|=>)/,
    },
  ],
  logCall: /\b(?:log|logger|debugPrint|print)\s*[.(]|\bthrow\s+[A-Z]\w*/,
};
