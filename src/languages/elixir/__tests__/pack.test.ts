/** The Elixir pack: identity, fallback symbols, the Phoenix dependency, Logger and raise lines. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { elixirPack } from '../pack.ts';

describe('elixirPack', () => {
  test('is tier 2 with a grammar and the Phoenix routes', () => {
    expect(elixirPack).toMatchObject({
      id: 'elixir',
      name: 'Elixir',
      tier: 2,
      extensions: ['.ex', '.exs'],
      grammar: 'elixir',
    });
    expect(elixirPack.routeExtractors).toHaveLength(1);
  });

  test('finds modules, protocols, implementations and functions', () => {
    const source = `defmodule Shop.Orders do
  def cancel(order_id, reason \\\\ nil) do
  end

  defp valid?(order), do: order.status == :open

  defmacro with_order(id, do: block) do
  end
end

defprotocol Shop.Priced do
  def price(item)
end

defimpl Shop.Priced, for: Shop.Order do
  def price(order), do: order.total
end
`;
    expect(
      regexSymbols(source, elixirPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'module Shop.Orders',
      'method cancel',
      'method valid?',
      'method with_order',
      'interface Shop.Priced',
      'method price',
      'module Shop.Priced',
      'method price',
    ]);
  });

  test('detects Phoenix in mix.exs and matches Logger and raise lines', () => {
    const mix =
      'defp deps do\n  [\n    {:phoenix, "~> 1.7.12"},\n    {:ecto_sql, "~> 3.10"}\n  ]\nend';
    const rule = elixirPack.frameworks?.find(
      (candidate) => candidate.file.test('mix.exs') && candidate.contains.test(mix),
    );
    expect(rule?.name).toBe('phoenix');
    expect(elixirPack.logCall?.test('    Logger.error("refund failed: #{inspect(reason)}")')).toBe(
      true,
    );
    expect(elixirPack.logCall?.test('    raise ArgumentError, "invalid order"')).toBe(true);
    expect(elixirPack.logCall?.test('    total = Enum.sum(amounts)')).toBe(false);
  });
});
