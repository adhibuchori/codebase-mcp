/** The Protocol Buffers pack: identity, outline symbols and the gRPC definitions extractor. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { protoPack } from '../pack.ts';

describe('protoPack', () => {
  test('is tier 3 without a grammar', () => {
    expect(protoPack).toMatchObject({
      id: 'proto',
      name: 'Protocol Buffers',
      tier: 3,
      extensions: ['.proto'],
    });
    expect(protoPack.grammar).toBeUndefined();
  });

  test('outlines services with their rpcs, messages and enums', () => {
    const proto = `service InventoryService {
  rpc Reserve(ReserveRequest) returns (ReserveReply);
}

message ReserveRequest {
  enum Priority {
    NORMAL = 0;
  }
  string sku = 1;
}
`;
    expect(
      regexSymbols(proto, protoPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.container}.${symbol.name}`,
      ),
    ).toEqual([
      'interface .InventoryService',
      'method InventoryService.Reserve',
      'class .ReserveRequest',
      'enum ReserveRequest.Priority',
    ]);
  });

  test('extracts gRPC method definitions', () => {
    const [extract] = protoPack.routeExtractors ?? [];
    expect(
      extract?.('service Health {\n  rpc Check(Ping) returns (Pong);\n}').map(
        (route) => route.pattern,
      ),
    ).toEqual(['Health/Check']);
  });
});
