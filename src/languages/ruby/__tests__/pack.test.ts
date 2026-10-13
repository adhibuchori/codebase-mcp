/** The Ruby pack: identity, fallback symbols, Gemfile frameworks, log and raise lines. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { rubyPack } from '../pack.ts';

describe('rubyPack', () => {
  test('is tier 2 and claims Gemfile and Rakefile by name', () => {
    expect(rubyPack).toMatchObject({
      id: 'ruby',
      name: 'Ruby',
      tier: 2,
      extensions: ['.rb', '.rake'],
      fileNames: ['Gemfile', 'Rakefile'],
      grammar: 'ruby',
    });
    expect(rubyPack.routeExtractors).toHaveLength(1);
  });

  test('finds modules, classes and methods', () => {
    const model = `module Billing
  class Invoice < ApplicationRecord
    def self.overdue
    end

    def paid?
    end

    def total=(value)
    end

    class << self
    end
  end
end
`;
    expect(
      regexSymbols(model, rubyPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'module Billing',
      'class Invoice',
      'method overdue',
      'method paid?',
      'method total=',
    ]);
  });

  test('detects Rails and Sinatra from the Gemfile', () => {
    const gemfile =
      "source 'https://rubygems.org'\n\ngem 'rails', '~> 7.1.3'\ngem \"sinatra\", require: false\ngem 'rails-i18n'\n";
    const detected = (rubyPack.frameworks ?? [])
      .filter((rule) => rule.file.test('Gemfile') && rule.contains.test(gemfile))
      .map((rule) => rule.name);
    expect(detected).toEqual(['rails', 'sinatra']);
    expect(rubyPack.frameworks?.some((rule) => rule.file.test('Gemfile.lock'))).toBe(false);
  });

  test('matches log and raise lines', () => {
    expect(rubyPack.logCall?.test('    Rails.logger.error("Refund failed for #{order.id}")')).toBe(
      true,
    );
    expect(rubyPack.logCall?.test('    raise Billing::Declined, "card declined"')).toBe(true);
    expect(rubyPack.logCall?.test("    raise 'unexpected state'")).toBe(true);
    expect(rubyPack.logCall?.test('    total = lines.sum(&:amount)')).toBe(false);
  });
});
