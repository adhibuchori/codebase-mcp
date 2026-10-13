/** Frames keep the file as printed minus file://, and a hint ready for suffix matching. */
import { describe, expect, test } from 'bun:test';
import { stackFrame, unescapeTrace } from '../stack-frame.ts';

const frame = (file: string) =>
  stackFrame({ raw: `at handler (${file}:12:5)`, file, line: 12, func: 'handler' });

describe('stackFrame', () => {
  test('keeps a plain path as printed', () => {
    expect(frame('/app/src/orders/orders.service.ts')).toEqual({
      raw: 'at handler (/app/src/orders/orders.service.ts:12:5)',
      file: '/app/src/orders/orders.service.ts',
      line: 12,
      func: 'handler',
      pathHint: '/app/src/orders/orders.service.ts',
    });
  });

  test('drops the file:// scheme from the file and the hint', () => {
    expect(frame('file:///app/dist/server.mjs')).toMatchObject({
      file: '/app/dist/server.mjs',
      pathHint: '/app/dist/server.mjs',
    });
  });

  test('keeps the drive of a Windows file URL', () => {
    expect(frame('file:///C:/build/app/server.mjs').file).toBe('C:/build/app/server.mjs');
  });

  test('drops a bundler prefix from the hint only', () => {
    expect(frame('webpack://orders-api/src/orders.ts')).toMatchObject({
      file: 'webpack://orders-api/src/orders.ts',
      pathHint: 'src/orders.ts',
    });
    expect(frame('webpack-internal:///./src/index.js').pathHint).toBe('./src/index.js');
  });

  test('turns Windows backslashes into forward slashes in the hint', () => {
    expect(frame('C:\\build\\app\\src\\orders.js')).toMatchObject({
      file: 'C:\\build\\app\\src\\orders.js',
      pathHint: 'C:/build/app/src/orders.js',
    });
  });
});

describe('unescapeTrace', () => {
  const escapedFrame = /\\n\s+at /;

  test('unescapes a trace copied out of a JSON log line', () => {
    const logged = String.raw`{"err":"Error: boom\r\n    at handler (C:\\app\\x.js:1:2)\n\t\"done\""}`;
    expect(unescapeTrace(logged, escapedFrame)).toBe(
      '{"err":"Error: boom\n    at handler (C:\\app\\x.js:1:2)\n\t"done""}',
    );
  });

  test('leaves a plain trace alone, Windows paths included', () => {
    const plain = 'Error: boom\n    at handler (C:\\new\\tasks\\x.js:1:2)';
    expect(unescapeTrace(plain, escapedFrame)).toBe(plain);
  });
});
