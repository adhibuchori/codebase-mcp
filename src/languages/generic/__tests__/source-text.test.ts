/** The source readers route extractors share: call arguments, strings and comment-aware matches. */
import { describe, expect, test } from 'bun:test';
import { matchLines } from '../../../core/text/lines.ts';
import {
  argsOfCall,
  C_STYLE_COMMENT,
  callArgs,
  codeMatches,
  HASH_COMMENT,
  leadingString,
  linePrefix,
  PHP_COMMENT,
  quotedStrings,
} from '../source-text.ts';

describe('callArgs', () => {
  test('cuts the arguments of a call spanning several lines, nested calls included', () => {
    const code = `fetch(url, {\n  method: 'POST',\n  body: JSON.stringify(order),\n}).then(read);`;
    expect(callArgs(code, code.indexOf('('))).toBe(
      `url, {\n  method: 'POST',\n  body: JSON.stringify(order),\n}`,
    );
  });

  test('stops at 4000 characters when the call never closes', () => {
    const code = `register(${'x'.repeat(5000)}`;
    expect(callArgs(code, code.indexOf('('))).toHaveLength(3999);
  });

  test('gives the arguments of the call a match ends at', () => {
    const code = 'router.get(\n  "/orders/:id",\n  handler,\n);';
    const [match] = matchLines(code, /router\.get\(/g);
    expect(match && argsOfCall(code, match)).toBe('\n  "/orders/:id",\n  handler,\n');
  });
});

describe('strings', () => {
  test('quotedStrings reads every quote style in order', () => {
    expect(quotedStrings(`methods=["GET", 'POST', \`PUT\`]`)).toEqual(['GET', 'POST', 'PUT']);
  });

  test('leadingString reads only a leading literal, Python prefixes included', () => {
    expect(leadingString(`  '/orders/:id', handler`)).toBe('/orders/:id');
    expect(leadingString(`f"{BASE_URL}/orders/{order_id}", timeout=5`)).toBe(
      '{BASE_URL}/orders/{order_id}',
    );
    expect(leadingString(`r'^orders/(?P<id>\\d+)/$'`)).toBe('^orders/(?P<id>\\d+)/$');
    expect(leadingString('ORDERS_URL, timeout=5')).toBeUndefined();
  });
});

describe('comment-aware matching', () => {
  test('linePrefix is the text before the index on its line, at most 120 characters', () => {
    const code = 'const a = 1;\n  const res = await app.get("/old")';
    expect(linePrefix(code, code.indexOf('app'))).toBe('  const res = await ');
    expect(linePrefix('app.get', 0)).toBe('');
    const long = `${'x'.repeat(500)} await app.get("/a")`;
    expect(linePrefix(long, long.indexOf('app'))).toHaveLength(120);
  });

  test('keeps track of line starts across many matches on long lines', () => {
    const code = `${"app.get('/a'); ".repeat(3)}\n  // app.get('/b'); app.get('/c');\napp.get('/d');`;
    expect(codeMatches(code, /app\.get\(/g, C_STYLE_COMMENT).map((match) => match.line)).toEqual([
      1, 1, 1, 3,
    ]);
  });

  test('skips matches on commented-out JavaScript lines', () => {
    const code = [
      "app.get('/live', live);",
      "// app.get('/dead', dead);",
      "/* app.get('/block', dead); */",
      " * app.get('/jsdoc', example);",
    ].join('\n');
    expect(codeMatches(code, /app\.get\(/g, C_STYLE_COMMENT).map((match) => match.line)).toEqual([
      1,
    ]);
  });

  test('skips # comments in Python and Ruby, and PHP comments but not attributes', () => {
    expect(
      codeMatches('requests.get(url)\n# requests.get(old)', /requests\.get/g, HASH_COMMENT),
    ).toHaveLength(1);
    const php = "#[Route('/a')]\n# Route::get('/b')\n// Route::get('/c')\n * @Route(\"/d\")";
    expect(codeMatches(php, /Route/g, PHP_COMMENT).map((match) => match.line)).toEqual([1, 4]);
  });
});
