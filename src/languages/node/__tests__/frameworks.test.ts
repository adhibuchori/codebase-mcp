/** npm frameworks read from package.json, and the log and throw lines that rank log sources. */
import { describe, expect, test } from 'bun:test';
import { nodeFrameworks, nodeLogCall } from '../frameworks.ts';

const detected = (path: string, content: string): string[] =>
  nodeFrameworks
    .filter((rule) => rule.file.test(path) && rule.contains.test(content))
    .map((rule) => rule.name);

describe('nodeFrameworks', () => {
  test('names the frameworks a package.json depends on', () => {
    const manifest = JSON.stringify(
      {
        name: 'orders-api',
        dependencies: {
          '@nestjs/core': '^10.3.0',
          '@grpc/grpc-js': '^1.10.0',
          axios: '^1.6.8',
          express: '^4.19.2',
          kafkajs: '^2.2.4',
        },
        devDependencies: { next: '14.2.3', fastify: '^4.26.0', hono: '^4.2.0', koa: '^2.15.0' },
      },
      null,
      2,
    );
    expect(detected('services/orders/package.json', manifest).toSorted()).toEqual([
      'axios',
      'express',
      'fastify',
      'grpc-node',
      'hono',
      'kafkajs',
      'koa',
      'nestjs',
      'nextjs',
    ]);
  });

  test('reads only package.json, and only dependency keys', () => {
    expect(detected('README.md', '"express": "^4.19.2"')).toEqual([]);
    expect(
      detected('package.json', '{ "name": "express-helpers", "description": "uses next" }'),
    ).toEqual([]);
  });
});

describe('nodeLogCall', () => {
  test('matches log and throw statements', () => {
    expect(nodeLogCall.test('    this.logger.error(`Payment ${id} failed`, err.stack);')).toBe(
      true,
    );
    expect(nodeLogCall.test("  console.warn('retrying order sync');")).toBe(true);
    expect(nodeLogCall.test('  throw new NotFoundException(`Order ${id} not found`);')).toBe(true);
  });

  test('ignores ordinary calls', () => {
    expect(nodeLogCall.test('  const errors = validate(order);')).toBe(false);
    expect(nodeLogCall.test("  catalog.info('x');")).toBe(false);
  });
});
