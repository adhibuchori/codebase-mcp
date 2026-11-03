/**
 * One file's part of the call graph, from the captures of its graph query and its symbols: the
 * package, the imports, and every call, render, construction and type relation with the
 * definition it sits in and the scope its name resolves to. Pure, so it is tested without a parser.
 */
import type { SymbolDef } from '../model/domain.types.ts';
import type {
  CodeRef,
  FileGraph,
  ImportStyle,
  RawCapture,
  RawMatch,
} from '../model/graph.types.ts';
import { enclosingSymbol, qualifiedName } from '../symbols/symbol-tree.ts';
import { bindingOf } from './bindings.ts';
import { importOf } from './imports.ts';
import {
  plainCallScope,
  receiverScope,
  typeScope,
  type FileContext,
  type UseSite,
} from './scopes.ts';
import { bareType, captureMap, lastSegment, plainReceiver } from './type-text.ts';

type Captures = ReadonlyMap<string, RawCapture>;

const CALLABLE = new Set(['method', 'function', 'constructor']);

export const EMPTY_GRAPH: FileGraph = { pkg: '', imports: [], refs: [] };

/** Standard libraries: their names never resolve to code in the indexed repos. */
const STANDARD = /^(?:java|javax|jakarta|kotlin|kotlinx)\./;

/**
 * A standard-library type never matches indexed code. With calls on chains, these were a third of
 * the refs on 4,000 Java files (measured), and the index stores neither.
 */
const worthKeeping = (ref: CodeRef): boolean => !STANDARD.test(ref.scope);

function siteAt(symbols: readonly SymbolDef[], line: number): UseSite {
  const symbol = enclosingSymbol(symbols, line);
  if (!symbol) return { origin: '', originClass: '', line };
  const origin = qualifiedName(symbol);
  return { origin, originClass: CALLABLE.has(symbol.kind) ? symbol.container : origin, line };
}

function relationOf(found: Captures, symbols: readonly SymbolDef[], ctx: FileContext): CodeRef[] {
  const type = found.get('type.name');
  const parent = found.get('extends') ?? found.get('implements');
  const name = bareType(parent?.text ?? '');
  if (!type || !parent || !name) return [];
  const kind = parent.name === 'extends' ? 'extends' : 'implements';
  const origin = siteAt(symbols, type.line).origin;
  const scope = typeScope(name, ctx);
  return [{ kind, name: lastSegment(name), receiver: '', scope, line: parent.line, origin }];
}

function useOf(found: Captures, symbols: readonly SymbolDef[], ctx: FileContext): CodeRef[] {
  const call = found.get('call.name') ?? found.get('render');
  if (!call) return [];
  const kind = call.name === 'render' ? 'render' : 'call';
  const written = found.get('call.receiver')?.text;
  const site = siteAt(symbols, call.line);
  const base = { kind, line: call.line, origin: site.origin } as const;
  if (written === undefined) return plainUse(base, call.text, { site, ctx });
  /* A chain (`a.find().orElseThrow()`) could only ever match by name: not worth storing. */
  const receiver = plainReceiver(written);
  if (!receiver) return [];
  return [{ ...base, name: call.text, receiver, scope: receiverScope(receiver, site, ctx) }];
}

/** A call or element without a receiver; lowercase JSX elements are HTML tags, not components. */
function plainUse(
  base: Pick<CodeRef, 'kind' | 'line' | 'origin'>,
  name: string,
  at: { site: UseSite; ctx: FileContext },
): CodeRef[] {
  if (base.kind === 'render' && /^[a-z]/.test(name)) return [];
  return [{ ...base, ...plainCallScope(name, at.site, at.ctx), receiver: '' }];
}

function constructionOf(
  found: Captures,
  symbols: readonly SymbolDef[],
  ctx: FileContext,
): CodeRef[] {
  const created = found.get('new');
  const type = bareType(created?.text ?? '');
  if (!created || !type) return [];
  const origin = siteAt(symbols, created.line).origin;
  const scope = typeScope(type, ctx);
  return [
    { kind: 'new', name: lastSegment(type), receiver: '', scope, line: created.line, origin },
  ];
}

/** Calls only, by name: a language without a graph query, from its tags query. */
function namesOnly(matches: readonly Captures[], symbols: readonly SymbolDef[]): FileGraph {
  const refs = matches.flatMap((found): CodeRef[] => {
    const call = found.get('call.name');
    if (!call) return [];
    const origin = siteAt(symbols, call.line).origin;
    return [{ kind: 'call', name: call.text, receiver: '', scope: '', line: call.line, origin }];
  });
  return { pkg: '', imports: [], refs };
}

export function buildFileGraph(
  matches: readonly RawMatch[],
  symbols: readonly SymbolDef[],
  style: ImportStyle | null,
): FileGraph {
  const found = matches.map(captureMap);
  if (!style) return namesOnly(found, symbols);
  const pkg = found.find((captures) => captures.has('package'))?.get('package')?.text ?? '';
  const imports = found.flatMap((captures) => importOf(captures) ?? []);
  const scopeAt = (line: number): string => siteAt(symbols, line).origin;
  const bindings = found.flatMap((captures) => bindingOf(captures, scopeAt) ?? []);
  const topLevel = new Set(symbols.filter((s) => s.container === '').map((s) => s.name));
  const ctx: FileContext = { style, pkg, imports, bindings, topLevel };
  const refs = [relationOf, useOf, constructionOf]
    .flatMap((read) => found.flatMap((captures) => read(captures, symbols, ctx)))
    .filter(worthKeeping)
    .toSorted((a, b) => a.line - b.line);
  return { pkg, imports, refs };
}
