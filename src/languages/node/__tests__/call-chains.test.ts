/** Reading a call and the calls chained after it, with arguments and lines, across line breaks. */
import { describe, expect, test } from 'bun:test';
import { matchLines } from '../../../core/text/lines.ts';
import { callOf, chainAfter } from '../call-chains.ts';

const routes = `const orders = new Hono()
  .get('/', (c) => c.json(list()))
  .post(
    '/',
    create,
  );
router
  .route('/:id')
  .put(update).delete(remove);
`;

describe('callOf', () => {
  test('reads the call a match ends at, on the line of its opening parenthesis', () => {
    const [match] = matchLines(routes, /\bnew Hono\(/g);
    expect(match && callOf(routes, match)).toEqual({ open: 23, args: '', line: 1 });
    const [route] = matchLines(routes, /\brouter\s*\.route\(/g);
    expect(route && callOf(routes, route)).toMatchObject({ args: "'/:id'", line: 8 });
  });
});

describe('chainAfter', () => {
  test('follows the chain across lines and multi-line arguments', () => {
    const [match] = matchLines(routes, /\bnew Hono\(/g);
    const links = match ? chainAfter(routes, callOf(routes, match)) : [];
    expect(links.map((link) => [link.name, link.args.trim(), link.line])).toEqual([
      ['get', "'/', (c) => c.json(list())", 2],
      ['post', "'/',\n    create,", 3],
    ]);
  });

  test('reads several links on one line and stops where the chain ends', () => {
    const [route] = matchLines(routes, /\brouter\s*\.route\(/g);
    const links = route ? chainAfter(routes, callOf(routes, route)) : [];
    expect(links.map((link) => `${link.line} ${link.name}(${link.args})`)).toEqual([
      '9 put(update)',
      '9 delete(remove)',
    ]);
  });
});
