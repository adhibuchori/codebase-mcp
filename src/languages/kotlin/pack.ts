/**
 * The Kotlin language pack: regex symbols for when the grammar is unavailable, Spring, Feign,
 * messaging and Ktor routes, Ktor detection in Gradle and Maven builds (the Spring rules come with
 * the Java pack), and the logger and throw calls that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { jvmMessaging } from '../jvm/messaging.ts';
import { springRoutes } from '../jvm/spring.ts';
import { ktorRoutes } from './ktor.ts';

export const kotlinPack: LanguagePack = {
  id: 'kotlin',
  name: 'Kotlin',
  tier: 1,
  extensions: ['.kt', '.kts'],
  grammar: 'kotlin',
  symbolPatterns: [
    {
      kind: 'class',
      regex:
        /^\s*(?:(?:public|private|protected|internal|abstract|final|open|sealed|data|enum|annotation|inner|value|inline|expect|actual)\s+)*class\s+(\w+)/,
    },
    {
      kind: 'object',
      regex: /^\s*(?:(?:public|private|protected|internal|data|companion)\s+)*object\s+(\w+)/,
    },
    {
      kind: 'interface',
      regex: /^\s*(?:(?:public|private|protected|internal|sealed|fun)\s+)*interface\s+(\w+)/,
    },
    {
      kind: 'function',
      regex:
        /^\s*(?:(?:public|private|protected|internal|override|open|abstract|final|suspend|inline|operator|infix|tailrec|external|actual|expect)\s+)*fun\s+(?:<[^<>]*>\s*)?(?:[\w.<>?]+\.)?(\w+)\s*\(/,
    },
  ],
  routeExtractors: [springRoutes, jvmMessaging, ktorRoutes],
  frameworks: [
    { file: /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/, contains: /io\.ktor/, name: 'ktor' },
  ],
  logCall:
    /\b(?:log|logger|LOG|LOGGER)\s*\.\s*(?:trace|debug|info|warn|error)\s*[({]|\bthrow\s+[\w.]+\s*\(/,
};
