import { expect, spyOn, test } from 'bun:test';
import { createConsoleLogger, isLogLevel } from '../console-logger.ts';

test('writes one line per event at or above the level, with quoted fields when needed', () => {
  const lines: string[] = [];
  const logger = createConsoleLogger('info', (line) => lines.push(line));
  logger.debug('hidden');
  logger.info('indexed', { repo: 'orders', files: 3, ok: true });
  logger.warn('slow', { note: 'two words' });
  logger.error('failed');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toMatch(
    /^\[\d{4}-\d{2}-\d{2}T[^\]]+\] INFO indexed repo=orders files=3 ok=true$/,
  );
  expect(lines[1]).toContain('WARN slow note="two words"');
  expect(lines[2]).toMatch(/ERROR failed$/);
});

test('debug level shows everything; empty fields add nothing', () => {
  const lines: string[] = [];
  createConsoleLogger('debug', (line) => lines.push(line)).debug('visible', {});
  expect(lines[0]).toMatch(/DEBUG visible$/);
});

test('the default sink is stderr', () => {
  const stderr = spyOn(console, 'error').mockImplementation(() => {});
  const logger = createConsoleLogger('warn');
  logger.info('quiet');
  logger.warn('loud');
  expect(stderr).toHaveBeenCalledTimes(1);
  expect(String(stderr.mock.calls[0]?.[0])).toContain('WARN loud');
  stderr.mockRestore();
});

test('isLogLevel', () => {
  expect(isLogLevel('warn')).toBe(true);
  expect(isLogLevel('verbose')).toBe(false);
});
