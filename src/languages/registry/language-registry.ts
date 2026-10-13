/**
 * Every language pack and stack parser, and the lookup from a path to its pack. Adding a language
 * means adding its folder under src/languages/ and one line here; nothing else changes.
 */
import type { ParsedTrace } from '../../core/model/domain.types.ts';
import type { LanguagePack, StackParser } from '../../core/model/language-pack.types.ts';
import { baseName, extensionOf } from '../../core/text/lines.ts';
import type { LanguageRegistry } from '../../ports/runtime.ts';
import { cPack } from '../c/pack.ts';
import { cppPack } from '../cpp/pack.ts';
import { csharpPack } from '../csharp/pack.ts';
import { dotnetStackParser } from '../csharp/stack.ts';
import { dartPack } from '../dart/pack.ts';
import { elixirPack } from '../elixir/pack.ts';
import { configPack, genericPack } from '../generic/pack.ts';
import { goPack } from '../go/pack.ts';
import { goStackParser } from '../go/stack.ts';
import { javaPack } from '../java/pack.ts';
import { javascriptPack } from '../javascript/pack.ts';
import { jvmStackParser } from '../jvm/stack.ts';
import { kotlinPack } from '../kotlin/pack.ts';
import { nodeStackParser } from '../node/stack.ts';
import { phpPack } from '../php/pack.ts';
import { phpStackParser } from '../php/stack.ts';
import { protoPack } from '../proto/pack.ts';
import { pythonPack } from '../python/pack.ts';
import { pythonStackParser } from '../python/stack.ts';
import { rubyPack } from '../ruby/pack.ts';
import { rubyStackParser } from '../ruby/stack.ts';
import { rustPack } from '../rust/pack.ts';
import { scalaPack } from '../scala/pack.ts';
import { swiftPack } from '../swift/pack.ts';
import { tsxPack, typescriptPack } from '../typescript/pack.ts';

export const PACKS: readonly LanguagePack[] = [
  javaPack,
  kotlinPack,
  scalaPack,
  goPack,
  csharpPack,
  typescriptPack,
  tsxPack,
  javascriptPack,
  pythonPack,
  phpPack,
  rubyPack,
  rustPack,
  cPack,
  cppPack,
  elixirPack,
  swiftPack,
  dartPack,
  protoPack,
  configPack,
];

export const STACK_PARSERS: readonly StackParser[] = [
  jvmStackParser,
  goStackParser,
  dotnetStackParser,
  nodeStackParser,
  pythonStackParser,
  phpStackParser,
  rubyStackParser,
];

function safeParse(parser: StackParser, text: string): ParsedTrace | null {
  try {
    return parser(text);
  } catch {
    return null;
  }
}

/** The trace parsed by whichever runtime's parser recognises the most frames. */
export function parseAnyTrace(
  text: string,
  parsers: readonly StackParser[] = STACK_PARSERS,
): ParsedTrace | null {
  let best: ParsedTrace | null = null;
  for (const parser of parsers) {
    const trace = safeParse(parser, text);
    if (trace && trace.frames.length > (best?.frames.length ?? 0)) best = trace;
  }
  return best;
}

export function createLanguageRegistry(
  packs: readonly LanguagePack[] = PACKS,
  fallback: LanguagePack = genericPack,
): LanguageRegistry {
  const byExtension = new Map<string, LanguagePack>();
  const byName = new Map<string, LanguagePack>();
  for (const pack of packs) {
    for (const extension of pack.extensions)
      if (!byExtension.has(extension)) byExtension.set(extension, pack);
    for (const name of pack.fileNames ?? []) byName.set(name.toLowerCase(), pack);
  }
  return {
    forPath: (path) =>
      byName.get(baseName(path).toLowerCase()) ?? byExtension.get(extensionOf(path)) ?? fallback,
    all: () => [...packs, fallback],
    parseTrace: (text) => parseAnyTrace(text),
  };
}
