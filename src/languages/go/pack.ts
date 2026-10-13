/**
 * The Go language pack: regex symbols for when the grammar is unavailable, router, client, Kafka and
 * gRPC routes, the go.mod requirements that reveal a framework, and the log, error and panic calls
 * that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { goRoutes } from './routes.ts';

const GO_MOD = /(?:^|\/)go\.mod$/;

export const goPack: LanguagePack = {
  id: 'go',
  name: 'Go',
  tier: 1,
  extensions: ['.go'],
  grammar: 'go',
  symbolPatterns: [
    { kind: 'method', regex: /^func\s*\([^)]*\)\s*(\w+)\s*[([]/ },
    { kind: 'function', regex: /^func\s+(\w+)\s*[([]/ },
    { kind: 'struct', regex: /^type\s+(\w+)(?:\[[^\]]*\])?\s+struct\b/ },
    { kind: 'interface', regex: /^type\s+(\w+)(?:\[[^\]]*\])?\s+interface\b/ },
    { kind: 'type', regex: /^type\s+(\w+)\b/ },
  ],
  routeExtractors: [goRoutes],
  frameworks: [
    { file: GO_MOD, contains: /github\.com\/gin-gonic\/gin\b/, name: 'gin' },
    { file: GO_MOD, contains: /github\.com\/labstack\/echo\b/, name: 'echo' },
    { file: GO_MOD, contains: /github\.com\/go-chi\/chi\b/, name: 'chi' },
    { file: GO_MOD, contains: /github\.com\/gofiber\/fiber\b/, name: 'fiber' },
    { file: GO_MOD, contains: /github\.com\/gorilla\/mux\b/, name: 'gorilla-mux' },
    { file: GO_MOD, contains: /google\.golang\.org\/grpc\b/, name: 'grpc' },
    { file: GO_MOD, contains: /github\.com\/segmentio\/kafka-go\b/, name: 'kafka-go' },
    { file: GO_MOD, contains: /github\.com\/(?:IBM|Shopify)\/sarama\b/, name: 'sarama' },
    {
      file: GO_MOD,
      contains: /github\.com\/confluentinc\/confluent-kafka-go\b/,
      name: 'confluent-kafka-go',
    },
  ],
  logCall:
    /\b(?:log|logger|slog|zap|zerolog|logrus|sugar)\b[^\n]{0,80}?\.(?:Print|Fatal|Panic|DPanic|Debug|Info|Warn|Warning|Error)(?:f|ln|w|Context)?\s*\(|\.Msgf?\s*\(|\bfmt\.Errorf\s*\(|\berrors\.(?:New|Wrapf?|Errorf)\s*\(|\bpanic\s*\(/,
};
