import { expect, test } from 'bun:test';
import type { StackFrame } from '../../model/domain.types.ts';
import { isLibraryFrame, pathSuffixes } from '../frame-paths.ts';

const frame = (fields: Partial<StackFrame>): StackFrame => ({
  raw: '',
  file: '',
  line: 1,
  func: '',
  pathHint: '',
  ...fields,
});

test('suffixes go from longest to the file name', () => {
  expect(pathSuffixes(frame({ pathHint: 'com/acme/orders/OrderService.java' }))).toEqual([
    'com/acme/orders/OrderService.java',
    'acme/orders/OrderService.java',
    'orders/OrderService.java',
    'OrderService.java',
  ]);
});

test('build-machine prefixes, drives, URLs and module versions are dropped', () => {
  expect(pathSuffixes(frame({ file: 'C:\\build\\src\\App.cs' }))[0]).toBe('build/src/App.cs');
  expect(pathSuffixes(frame({ file: 'file:///app/src/server.ts' }))[0]).toBe('app/src/server.ts');
  expect(pathSuffixes(frame({ file: 'webpack://gateway/./src/x.ts' }))[0]).toBe('src/x.ts');
  expect(
    pathSuffixes(frame({ file: '/go/pkg/mod/github.com/acme/payments@v1.2.3/internal/x.go' })).at(
      -2,
    ),
  ).toBe('internal/x.go');
});

test('library frames are recognised by path or function', () => {
  expect(isLibraryFrame(frame({ file: '/app/node_modules/express/lib/router.js' }))).toBe(true);
  expect(isLibraryFrame(frame({ file: 'node:internal/process/task_queues' }))).toBe(true);
  expect(isLibraryFrame(frame({ file: '/usr/lib/python3/site-packages/x.py' }))).toBe(true);
  expect(
    isLibraryFrame(
      frame({
        func: 'org.springframework.web.servlet.DispatcherServlet.doDispatch',
        file: 'DispatcherServlet.java',
      }),
    ),
  ).toBe(true);
  expect(
    isLibraryFrame(
      frame({
        func: 'com.acme.orders.OrderService.cancel',
        pathHint: 'com/acme/orders/OrderService.java',
      }),
    ),
  ).toBe(false);
});
