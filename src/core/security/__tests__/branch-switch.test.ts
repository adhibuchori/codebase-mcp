import { expect, test } from 'bun:test';
import { allowsSwitch, describeBranchSwitch, parseBranchSwitch } from '../branch-switch.ts';

test('unset, 0 or false keeps switching off for every repo', () => {
  for (const value of ['', ' 0 ', 'false', 'OFF']) {
    const policy = parseBranchSwitch(value);
    expect(allowsSwitch(policy, 'orders')).toBe(false);
    expect(describeBranchSwitch(policy)).toBe('');
  }
});

test('1, true or all allows every repo', () => {
  for (const value of ['1', 'true', 'All']) {
    const policy = parseBranchSwitch(value);
    expect(allowsSwitch(policy, 'anything')).toBe(true);
    expect(describeBranchSwitch(policy)).toBe('every repo');
  }
});

test('a list of names allows only those repos, in any case', () => {
  const policy = parseBranchSwitch(' Orders , payments-go ,');
  expect(allowsSwitch(policy, 'orders')).toBe(true);
  expect(allowsSwitch(policy, 'PAYMENTS-GO')).toBe(true);
  expect(allowsSwitch(policy, 'web')).toBe(false);
  expect(describeBranchSwitch(policy)).toBe('orders, payments-go');
});
