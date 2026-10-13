/**
 * Protocol Buffers, tier 3: no grammar, so outlines come from these regexes: services (an
 * interface of rpc methods), messages, enums and rpc methods, plus the gRPC method definitions
 * that link a service's handlers and clients across repos.
 */
import type { LanguagePack } from '../../core/model/language-pack.types.ts';
import { protoRoutes } from './routes.ts';

export const protoPack: LanguagePack = {
  id: 'proto',
  name: 'Protocol Buffers',
  tier: 3,
  extensions: ['.proto'],
  symbolPatterns: [
    { kind: 'interface', regex: /^\s*service\s+([A-Za-z_]\w*)/ },
    { kind: 'class', regex: /^\s*message\s+([A-Za-z_]\w*)/ },
    { kind: 'enum', regex: /^\s*enum\s+([A-Za-z_]\w*)/ },
    { kind: 'method', regex: /^\s*rpc\s+([A-Za-z_]\w*)/ },
  ],
  routeExtractors: [protoRoutes],
};
