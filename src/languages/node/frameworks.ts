/**
 * What the TypeScript and JavaScript packs share besides routes: the npm frameworks a package.json
 * declares, and the shape of a log or throw statement, which ranks the source of a pasted log line.
 */
import type { FrameworkRule } from '../../core/model/language-pack.types.ts';
import { escapeRegex } from '../../core/security/safe-regex.ts';

const PACKAGE_JSON = /(?:^|\/)package\.json$/;

/** A dependency key in package.json: `"@nestjs/core": "^10.0.0"`. */
function dependency(name: string, framework: string): FrameworkRule {
  return {
    file: PACKAGE_JSON,
    contains: new RegExp(`"${escapeRegex(name)}"\\s*:`),
    name: framework,
  };
}

export const nodeFrameworks: readonly FrameworkRule[] = [
  dependency('express', 'express'),
  dependency('@nestjs/core', 'nestjs'),
  dependency('fastify', 'fastify'),
  dependency('hono', 'hono'),
  dependency('koa', 'koa'),
  dependency('next', 'nextjs'),
  dependency('kafkajs', 'kafkajs'),
  dependency('@grpc/grpc-js', 'grpc-node'),
  dependency('axios', 'axios'),
];

/** `logger.error(`, `console.warn(`, `this.logger.log(`, and `throw new NotFoundException(`. */
export const nodeLogCall =
  /\b(?:console|logger|log)\.(?:log|info|warn|error|debug|trace|fatal)\(|\bthrow\s+new\s+[A-Za-z_$][\w$.]*\(/;
