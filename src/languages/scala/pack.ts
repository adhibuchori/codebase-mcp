/**
 * The Scala language pack (tier 2): regex symbols for classes, objects, traits and defs when the
 * grammar is unavailable, and the JVM messaging extractor, which also reads Kafka producer records
 * and ScalaPB's gRPC bindings.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { jvmMessaging } from '../jvm/messaging.ts';

export const scalaPack: LanguagePack = {
  id: 'scala',
  name: 'Scala',
  tier: 2,
  extensions: ['.scala', '.sc'],
  grammar: 'scala',
  symbolPatterns: [
    {
      kind: 'class',
      regex:
        /^\s*(?:(?:private|protected|abstract|final|sealed|case|implicit|open)(?:\[\w*\])?\s+)*class\s+(\w+)/,
    },
    {
      kind: 'object',
      regex: /^\s*(?:(?:private|protected|case|implicit|final)(?:\[\w*\])?\s+)*object\s+(\w+)/,
    },
    { kind: 'trait', regex: /^\s*(?:(?:private|protected|sealed)(?:\[\w*\])?\s+)*trait\s+(\w+)/ },
    {
      kind: 'function',
      regex:
        /^\s*(?:(?:private|protected|override|final|implicit|inline|transparent)(?:\[\w*\])?\s+)*def\s+(\w+)/,
    },
  ],
  routeExtractors: [jvmMessaging],
};
