/** The Python pack: identity, fallback symbols, frameworks from build files, log and raise lines. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { pythonPack } from '../pack.ts';

const detected = (path: string, content: string): string[] =>
  (pythonPack.frameworks ?? [])
    .filter((rule) => rule.file.test(path) && rule.contains.test(content))
    .map((rule) => rule.name);

describe('pythonPack', () => {
  test('is tier 1 with a grammar and the Python routes', () => {
    expect(pythonPack).toMatchObject({
      id: 'python',
      name: 'Python',
      tier: 1,
      extensions: ['.py', '.pyi'],
      grammar: 'python',
    });
    expect(pythonPack.routeExtractors).toHaveLength(1);
  });

  test('finds classes, functions and methods', () => {
    const module = `class OrderService:
    def __init__(self, repo):
        self.repo = repo

    async def cancel(self, order_id: int) -> None:
        ...

def build_service() -> OrderService:
    return OrderService(Repo())
`;
    expect(
      regexSymbols(module, pythonPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.container}.${symbol.name}`,
      ),
    ).toEqual([
      'class .OrderService',
      'method OrderService.__init__',
      'method OrderService.cancel',
      'function .build_service',
    ]);
  });
});

describe('frameworks', () => {
  test('reads requirements files', () => {
    const requirements =
      'Django>=5.0,<5.1\ncelery[redis]==5.3.6\ndjangorestframework==3.15.1\ngrpcio==1.62.0\n# fastapi is not used\n';
    expect(detected('requirements/base.txt', requirements)).toEqual([
      'django',
      'celery',
      'grpc-python',
    ]);
    expect(detected('services/orders/requirements-dev.txt', 'kafka-python==2.0.2')).toEqual([
      'kafka-python',
    ]);
  });

  test('reads pyproject.toml and Pipfile entries', () => {
    const pyproject =
      '[project]\nname = "orders-service"\ndependencies = [\n  "fastapi>=0.110",\n  "confluent-kafka>=2.3",\n]\n';
    expect(detected('pyproject.toml', pyproject)).toEqual(['fastapi', 'confluent-kafka']);
    expect(detected('Pipfile', '[packages]\nflask = "*"\n')).toEqual(['flask']);
    expect(detected('setup.py', 'install_requires=["flask-cors>=4"]')).toEqual([]);
    expect(detected('README.md', 'fastapi==0.110')).toEqual([]);
  });
});

describe('logCall', () => {
  test('matches logger calls and raise statements', () => {
    expect(
      pythonPack.logCall?.test('    logger.exception("refund failed for order %s", order_id)'),
    ).toBe(true);
    expect(pythonPack.logCall?.test('    _log.warning("retrying")')).toBe(true);
    expect(pythonPack.logCall?.test('        raise OrderNotFound(order_id)')).toBe(true);
    expect(pythonPack.logCall?.test('    total = sum(line.amount for line in order.lines)')).toBe(
      false,
    );
  });
});
