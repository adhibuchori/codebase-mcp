/**
 * From a printed stack frame to the repo files it may point at. Runtimes print paths from the
 * build machine or container (/app/src/…, C:\build\…, module@v1.2.3/…), so the frame is reduced to
 * suffixes, most specific first, and the indexer's file list is matched by suffix, as Sentry's code
 * mappings do.
 */
import type { StackFrame } from '../model/domain.types.ts';

/** Repo-relative suffixes to try, longest first, never shorter than the file name. */
export function pathSuffixes(frame: StackFrame): string[] {
  const source = frame.pathHint || frame.file;
  const clean = source
    .replaceAll('\\', '/')
    .replace(/^file:\/\//, '')
    .replace(/^webpack:\/\/[^/]*\//, '')
    .replace(/^[a-zA-Z]:\//, '/')
    .replace(/^.*\/node_modules\//, 'node_modules/');
  const segments = clean.split('/').filter((s) => s && s !== '.' && !/@v?\d+\.\d+/.test(s));
  const suffixes: string[] = [];
  for (let start = 0; start < segments.length; start++)
    suffixes.push(segments.slice(start).join('/'));
  return suffixes;
}

const LIBRARY_FILE =
  /(^|\/)(node_modules|site-packages|dist-packages|vendor|gems|\.m2|\.gradle|go\/pkg\/mod)\/|^node:|^internal\//;
const LIBRARY_FUNC =
  /^(java|javax|jdk|sun|com\.sun|kotlin|kotlinx|scala|org\.springframework|org\.apache|io\.netty|reactor|io\.grpc|com\.fasterxml|org\.hibernate|System|Microsoft|runtime|net\/http|reflect)[.(/]/;

/** True for frames that belong to the runtime or a dependency rather than the application. */
export function isLibraryFrame(frame: StackFrame): boolean {
  return LIBRARY_FILE.test(frame.file.replaceAll('\\', '/')) || LIBRARY_FUNC.test(frame.func);
}
