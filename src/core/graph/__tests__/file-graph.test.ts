import { expect, test } from 'bun:test';
import type { SymbolDef } from '../../model/domain.types.ts';
import type { RawMatch } from '../../model/graph.types.ts';
import { buildFileGraph } from '../file-graph.ts';

const m = (line: number, captures: Record<string, string>): RawMatch =>
  Object.entries(captures).map(([name, text]) => ({ name, text, line }));

const sym = (
  name: string,
  kind: string,
  line: number,
  endLine: number,
  container = '',
): SymbolDef => ({
  name,
  kind,
  line,
  endLine,
  container,
  signature: '',
});

const javaSymbols = [sym('Svc', 'class', 3, 20), sym('run', 'method', 6, 18, 'Svc')];

test('Java: package, imports, relations, typed receivers, statics, self calls and constructions', () => {
  const graph = buildFileGraph(
    [
      m(1, { package: 'com.acme' }),
      m(2, { 'import.qualified': 'com.acme.pay.Client' }),
      m(2, { 'import.qualified': 'com.acme.util', 'import.statement': 'import com.acme.util.*' }),
      m(3, { 'type.name': 'Svc', extends: 'Base<T>' }),
      m(3, { 'type.name': 'Svc', implements: 'Api' }),
      m(3, { 'type.name': 'Svc', implements: 'var' }),
      m(4, { 'bind.name': 'client', 'bind.type': 'Client' }),
      m(7, { 'bind.name': 'local', 'bind.type': 'var', 'bind.value': 'Thing' }),
      m(8, { 'call.name': 'pay', 'call.receiver': 'this.client' }),
      m(9, { 'call.name': 'go', 'call.receiver': 'local' }),
      m(10, { 'call.name': 'fmt', 'call.receiver': 'Util' }),
      m(11, { 'call.name': 'helper' }),
      m(12, { 'call.name': 'size', 'call.receiver': 'items' }),
      m(13, { 'call.name': 'x', 'call.receiver': 'a.b().c' }),
      m(14, { 'call.name': 'base', 'call.receiver': 'super' }),
      m(15, { new: 'String' }),
      m(17, { 'bind.name': 'gone', 'bind.type': '' }),
      m(18, { 'call.name': 'y', 'call.receiver': 'this.missing' }),
    ],
    javaSymbols,
    'packages',
  );
  expect(graph.pkg).toBe('com.acme');
  expect(graph.imports).toEqual([
    { local: 'Client', imported: 'Client', source: 'com.acme.pay' },
    { local: '*', imported: '*', source: 'com.acme.util' },
  ]);
  expect(graph.refs.map((r) => `${r.kind} ${r.name} ${r.receiver}|${r.scope}|${r.origin}`)).toEqual(
    [
      'extends Base |?Base|Svc',
      'implements Api |?Api|Svc',
      'call pay this.client|com.acme.pay.Client|Svc.run',
      'call go local|?Thing|Svc.run',
      'call fmt Util|?Util|Svc.run',
      'call helper |com.acme.Svc|Svc.run',
      'call size items||Svc.run',
      'call base super|com.acme.Svc|Svc.run',
      'call y this.missing||Svc.run',
    ],
  );
});

test('Java without wildcards: same-package types, top-level types and a default package', () => {
  const graph = buildFileGraph(
    [
      m(5, { 'call.name': 'a', 'call.receiver': 'Peer' }),
      m(6, { 'call.name': 'b', 'call.receiver': 'Svc.Inner' }),
    ],
    javaSymbols,
    'packages',
  );
  expect(graph.refs.map((r) => r.scope)).toEqual(['Peer', 'Svc.Inner']);
  const withPkg = buildFileGraph(
    [
      m(1, { package: 'p' }),
      m(5, { 'call.name': 'a', 'call.receiver': 'Peer' }),
      m(6, { 'call.name': 'b', 'call.receiver': 'com.x.Y' }),
    ],
    javaSymbols,
    'packages',
  );
  expect(withPkg.refs.map((r) => r.scope)).toEqual(['p.Peer', '']);
  expect(buildFileGraph([m(1, { 'call.name': 'top' })], [], 'packages').refs[0]?.scope).toBe('');
});

const tsSymbols = [
  sym('Screen', 'function', 5, 20),
  sym('Local', 'class', 22, 30),
  sym('m', 'method', 23, 25, 'Local'),
];

test('modules: named, aliased, default and namespace imports, own types, renders', () => {
  const graph = buildFileGraph(
    [
      m(1, { 'import.name': 'cancelOrder', 'import.alias': 'cancel', 'import.source': './orders' }),
      m(1, { 'import.name': 'Api', 'import.source': './api' }),
      m(1, { 'import.name': 'store', 'import.source': './store' }),
      m(2, { 'import.default': 'Button', 'import.source': '../Button' }),
      m(3, { 'import.namespace': 'pay', 'import.source': '@/pay' }),
      m(4, { 'import.source': './side-effect' }),
      m(6, { 'bind.name': 'client', 'bind.type': 'Api' }),
      m(7, { 'bind.name': 'mine', 'bind.value': 'Local' }),
      m(8, { 'call.name': 'cancel' }),
      m(9, { 'call.name': 'refund', 'call.receiver': 'client' }),
      m(10, { 'call.name': 'go', 'call.receiver': 'mine' }),
      m(11, { 'call.name': 'fetch', 'call.receiver': 'pay' }),
      m(12, { 'call.name': 'create', 'call.receiver': 'Api' }),
      m(13, { 'call.name': 'get', 'call.receiver': 'store' }),
      m(14, { 'call.name': 'make', 'call.receiver': 'Local' }),
      m(15, { 'call.name': 'z', 'call.receiver': 'unknown' }),
      m(16, { render: 'Button' }),
      m(17, { render: 'div' }),
      m(18, { render: 'Item', 'call.receiver': 'List' }),
      m(19, { new: 'pay.Model' }),
      m(19, { new: 'pay' }),
      m(20, { 'call.name': 'Button' }),
      m(24, { 'call.name': 'm', 'call.receiver': 'this' }),
      m(24, { 'call.name': 'n', 'call.receiver': 'pay.deep' }),
    ],
    tsSymbols,
    'modules',
  );
  expect(graph.imports[0]).toEqual({
    local: 'cancel',
    imported: 'cancelOrder',
    source: './orders',
  });
  expect(graph.imports).toHaveLength(5);
  expect(graph.refs.map((r) => `${r.kind} ${r.name} ${r.receiver}|${r.scope}`)).toEqual([
    'call cancelOrder |./orders',
    'call refund client|./api#Api',
    'call go mine|#Local',
    'call fetch pay|@/pay',
    'call create Api|./api#Api',
    'call get store|./store',
    'call make Local|#Local',
    'call z unknown|',
    'render Button |../Button',
    'render Item List|',
    'new Model |@/pay#Model',
    'new pay |',
    'call Button |../Button',
    'call m this|#Local',
    'call n pay.deep|',
  ]);
});

test('types (Swift): bare type names, self, and constructions', () => {
  const graph = buildFileGraph(
    [
      m(4, { 'bind.name': 'api', 'bind.type': 'PaymentsApi?' }),
      m(8, { 'call.name': 'refund', 'call.receiver': 'self.api' }),
      m(9, { 'call.name': 'log', 'call.receiver': 'Logger' }),
      m(10, { 'call.name': 'audit' }),
      m(11, { new: 'PaymentsApi' }),
    ],
    javaSymbols,
    'types',
  );
  expect(graph.refs.map((r) => r.scope)).toEqual(['PaymentsApi', 'Logger', 'Svc', 'PaymentsApi']);
});

test('without a style only calls are kept, by name', () => {
  const graph = buildFileGraph(
    [m(7, { 'call.name': 'stop' }), m(8, { new: 'X' })],
    javaSymbols,
    null,
  );
  expect(graph).toEqual({
    pkg: '',
    imports: [],
    refs: [{ kind: 'call', name: 'stop', receiver: '', scope: '', line: 7, origin: 'Svc.run' }],
  });
});
