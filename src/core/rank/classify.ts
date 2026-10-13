/**
 * What kind of file a path is. Tests, generated code, vendored dependencies and docs stay
 * searchable but rank lower, as Zoekt does (it divides their score by 5).
 */
export const FLAG_TEST = 1;
export const FLAG_GENERATED = 2;
export const FLAG_VENDOR = 4;
export const FLAG_DOCS = 8;

const TEST_DIR = /(^|\/)(tests?|__tests__|spec|specs|testdata|test-data|e2e|integration-tests?)\//i;
const TEST_FILE =
  /(_test\.(go|py|exs)|\.(test|spec)\.[cm]?[jt]sx?|_spec\.rb|Tests?\.(java|kt|cs|scala|swift)|Spec\.(scala|kt|groovy)|IT\.java)$|(^|\/)test_[^/]+\.py$/;
const GENERATED_FILE =
  /(\.pb\.go|_pb2(_grpc)?\.py|\.pb\.(cc|h)|\.g\.dart|\.freezed\.dart|\.designer\.cs|\.generated\.[a-z]+|\.min\.(js|css)|-lock\.json|\.lock|\.snap)$|(^|\/)(generated|__generated__|gen)\//i;
const VENDOR_DIR = /(^|\/)(vendor|third_party|third-party|node_modules|bower_components|Pods)\//i;
const DOCS_FILE = /\.(md|mdx|rst|adoc|txt)$|(^|\/)docs?\//i;

/** Bit flags for a repo-relative path. */
export function classifyPath(path: string): number {
  let flags = 0;
  if (TEST_DIR.test(path) || TEST_FILE.test(path)) flags |= FLAG_TEST;
  if (GENERATED_FILE.test(path)) flags |= FLAG_GENERATED;
  if (VENDOR_DIR.test(path)) flags |= FLAG_VENDOR;
  if (DOCS_FILE.test(path)) flags |= FLAG_DOCS;
  return flags;
}

const GENERATED_HEADER =
  /code generated .* do not edit|@generated|auto-?generated|this file was generated/i;

/** True when the first lines of a file mark it as generated (Go's "Code generated … DO NOT EDIT."). */
export function hasGeneratedHeader(head: string): boolean {
  return GENERATED_HEADER.test(head.slice(0, 600));
}

/** Short labels for output: "test", "generated", "vendor", "docs". */
export function flagLabels(flags: number): string[] {
  const labels: string[] = [];
  if (flags & FLAG_TEST) labels.push('test');
  if (flags & FLAG_GENERATED) labels.push('generated');
  if (flags & FLAG_VENDOR) labels.push('vendor');
  if (flags & FLAG_DOCS) labels.push('docs');
  return labels;
}
