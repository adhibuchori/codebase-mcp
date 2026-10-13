/** The Rust pack: identity, fallback symbols (impl blocks own their functions), crates, log macros. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { rustPack } from '../pack.ts';

describe('rustPack', () => {
  test('is tier 2 with a grammar', () => {
    expect(rustPack).toMatchObject({
      id: 'rust',
      name: 'Rust',
      tier: 2,
      extensions: ['.rs'],
      grammar: 'rust',
    });
  });

  test('finds items, with functions inside impl blocks as methods', () => {
    const source = `pub mod orders {
}

pub(crate) struct Order {
    id: u64,
}

pub enum Status {
    Open,
}

pub unsafe trait Repository: Send + Sync {
}

impl<'a> fmt::Display for Order {
    fn fmt(&self, f: &mut fmt::Formatter<'a>) -> fmt::Result {
    }
}

impl Order {
    pub const fn new(id: u64) -> Self {
    }
}

pub async fn cancel_order(id: u64) -> Result<(), Error> {
}

extern "C" fn callback() {}
`;
    expect(
      regexSymbols(source, rustPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'module orders',
      'struct Order',
      'enum Status',
      'trait Repository',
      'impl Order',
      'method fmt',
      'impl Order',
      'method new',
      'function cancel_order',
      'function callback',
    ]);
  });

  test('detects web and gRPC crates in Cargo.toml', () => {
    const cargo = `[package]
name = "orders"

[dependencies]
axum = "0.7"
tonic = { version = "0.11", features = ["tls"] }
serde = "1"

[dependencies.actix-web]
version = "4"
`;
    const detected = (rustPack.frameworks ?? [])
      .filter((rule) => rule.file.test('services/orders/Cargo.toml') && rule.contains.test(cargo))
      .map((rule) => rule.name);
    expect(detected).toEqual(['actix-web', 'axum', 'tonic']);
  });

  test('matches log, error and panic macros', () => {
    expect(rustPack.logCall?.test('        error!(order_id = %id, "refund failed");')).toBe(true);
    expect(rustPack.logCall?.test('        bail!("order {} not found", id);')).toBe(true);
    expect(
      rustPack.logCall?.test('    let config = read_config().expect("config file is missing");'),
    ).toBe(true);
    expect(rustPack.logCall?.test('    let total: u64 = lines.iter().sum();')).toBe(false);
  });
});
