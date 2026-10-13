import { describe, expect, test } from 'bun:test';
import type { ParsedTrace } from '../../../core/model/domain.types.ts';
import {
  createLanguageRegistry,
  PACKS,
  parseAnyTrace,
  STACK_PARSERS,
} from '../language-registry.ts';

const registry = createLanguageRegistry();

describe('createLanguageRegistry', () => {
  test('a path finds its pack by file name first, then by extension, else the generic pack', () => {
    expect(registry.forPath('src/main/java/App.java')?.id).toBe('java');
    expect(registry.forPath('web/app.tsx')?.id).toBe('tsx');
    expect(registry.forPath('deploy/Dockerfile')?.id).toBe('config');
    expect(registry.forPath('scripts/build.zig')?.id).toBe('generic');
  });

  test('every pack is listed once, with the fallback last', () => {
    const ids = registry.all().map((pack) => pack.id);
    expect(ids).toHaveLength(PACKS.length + 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe('generic');
  });

  test('the first pack that claims an extension keeps it', () => {
    const first = { id: 'first', name: 'First', tier: 3 as const, extensions: ['.x'] };
    const second = { id: 'second', name: 'Second', tier: 3 as const, extensions: ['.x'] };
    expect(createLanguageRegistry([first, second]).forPath('a.x')?.id).toBe('first');
  });
});

function broken(): ParsedTrace {
  throw new Error('parser bug');
}

describe('parseAnyTrace', () => {
  test('the parser that recognises the most frames wins', () => {
    const trace = registry.parseTrace(
      'Exception in thread "main" java.lang.IllegalStateException: boom\n\tat com.acme.App.run(App.java:10)\n\tat com.acme.App.main(App.java:3)',
    );
    expect(trace?.runtime).toBe('jvm');
    expect(trace?.frames).toHaveLength(2);
    expect(STACK_PARSERS.length).toBeGreaterThanOrEqual(6);
  });

  test('a parser that throws is skipped; text without frames gives null', () => {
    const one: ParsedTrace = {
      runtime: 'toy',
      messages: ['m'],
      frames: [{ raw: 'f', file: 'a.toy', line: 1, func: 'f', pathHint: '' }],
    };
    expect(parseAnyTrace('x', [broken, () => one])).toBe(one);
    expect(parseAnyTrace('just words')).toBeNull();
  });
});
