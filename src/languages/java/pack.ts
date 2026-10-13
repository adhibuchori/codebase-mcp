/**
 * The Java language pack: regex symbols for when the grammar is unavailable, Spring, JAX-RS, Feign
 * and messaging routes, the JVM build files that reveal a framework, and the logger and throw calls
 * that rank log-source candidates.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { jvmMessaging } from '../jvm/messaging.ts';
import { springRoutes } from '../jvm/spring.ts';

const BUILD_FILE = /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/;

export const javaPack: LanguagePack = {
  id: 'java',
  name: 'Java',
  tier: 1,
  extensions: ['.java'],
  grammar: 'java',
  symbolPatterns: [
    {
      kind: 'class',
      regex:
        /^\s*(?:(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp)\s+)*class\s+(\w+)/,
    },
    {
      kind: 'interface',
      regex:
        /^\s*(?:(?:public|protected|private|abstract|static|sealed|non-sealed)\s+)*@?interface\s+(\w+)/,
    },
    { kind: 'enum', regex: /^\s*(?:(?:public|protected|private|static)\s+)*enum\s+(\w+)/ },
    {
      kind: 'record',
      regex: /^\s*(?:(?:public|protected|private|static|final)\s+)*record\s+(\w+)/,
    },
    {
      kind: 'method',
      regex:
        /^\s*(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^<>]*>\s+)?(?!(?:return|new|else|throw|yield|case|assert|do)\b)[\w.$]+(?:<[^()]*?>)?(?:\[\])*\s+(\w+)\s*\(/,
    },
  ],
  routeExtractors: [springRoutes, jvmMessaging],
  frameworks: [
    {
      file: BUILD_FILE,
      contains: /org\.springframework\.boot|spring-boot-starter/,
      name: 'spring-boot',
    },
    { file: BUILD_FILE, contains: /io\.quarkus/, name: 'quarkus' },
    { file: BUILD_FILE, contains: /io\.micronaut/, name: 'micronaut' },
    {
      file: BUILD_FILE,
      contains: /spring-cloud-(?:starter-)?openfeign/,
      name: 'spring-cloud-openfeign',
    },
    { file: BUILD_FILE, contains: /spring-kafka/, name: 'spring-kafka' },
    {
      file: BUILD_FILE,
      contains: /io\.grpc\b|grpc-(?:server-|client-)?spring-boot-starter/,
      name: 'grpc',
    },
  ],
  logCall:
    /\b(?:log|logger|LOG|LOGGER)\s*\.\s*(?:trace|debug|info|warn|error)\s*\(|\bthrow\s+new\s+[\w.]+\s*\(/,
};
