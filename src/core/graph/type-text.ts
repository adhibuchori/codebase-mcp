/**
 * Type and receiver text as a graph query captures it, reduced to what resolution compares: the
 * bare type name, a plain receiver, and the captures of one match by name.
 */
import type { RawCapture, RawMatch } from '../model/graph.types.ts';

const IDENTIFIER_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const NO_TYPE = new Set(['', 'var', 'val', 'let', 'const', 'null', 'undefined', 'any', 'unknown']);

/**
 * `@NonNull List<Order>[]` → `List`, `PaymentClient | null` → `PaymentClient`, `com.acme.Foo` stays
 * qualified. "" when no named type is left (`var`, a function type, an object literal).
 */
export function bareType(text: string): string {
  const unannotated = text.replace(/@[\w.]+(?:\([^)]*\))?\s*/g, '').replace(/\breadonly\s+/g, '');
  const parts = unannotated.split('|').map((part) => part.replace(/<[\s\S]*$/, '').trim());
  for (const part of parts) {
    const type = part.replace(/\[\]|[?!]/g, '').trim();
    if (!NO_TYPE.has(type)) return IDENTIFIER_PATH.test(type) ? type : '';
  }
  return '';
}

/** The last segment of a dotted name: `com.acme.Foo` → `Foo`. */
export function lastSegment(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1);
}

/** A receiver resolution can follow: `x`, `this`, `this.x`, `Type`, `Outer.Inner`; else "". */
export function plainReceiver(text: string): string {
  const compact = text.replace(/\s+/g, '');
  return IDENTIFIER_PATH.test(compact) ? compact : '';
}

/** The captures of one match by name; the first wins when a name repeats. */
export function captureMap(match: RawMatch): ReadonlyMap<string, RawCapture> {
  const map = new Map<string, RawCapture>();
  for (const capture of match) if (!map.has(capture.name)) map.set(capture.name, capture);
  return map;
}
