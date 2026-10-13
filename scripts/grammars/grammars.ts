/**
 * The vendored tree-sitter grammars: which npm package and version each comes from, and which tags
 * query goes with it. `bun run grammars:sync` refreshes assets/ from this list; the server never
 * downloads anything, so a locked-down machine needs no network or compiler.
 */
export interface GrammarSpec {
  /** Grammar id used by language packs and as the asset file name. */
  readonly id: string;
  readonly pkg: string;
  readonly version: string;
  /** Path of the .wasm file inside the package. */
  readonly wasm: string;
  /** Tags queries inside packages, concatenated in order; empty when the query is our own. */
  readonly queries: readonly {
    readonly pkg: string;
    readonly version: string;
    readonly path: string;
  }[];
}

const tags = (pkg: string, version: string) => ({ pkg, version, path: 'queries/tags.scm' });
const JS = tags('tree-sitter-javascript', '0.25.0');
const TS = tags('tree-sitter-typescript', '0.23.2');

export const GRAMMARS: readonly GrammarSpec[] = [
  {
    id: 'java',
    pkg: 'tree-sitter-java',
    version: '0.23.5',
    wasm: 'tree-sitter-java.wasm',
    queries: [tags('tree-sitter-java', '0.23.5')],
  },
  {
    id: 'kotlin',
    pkg: '@tree-sitter-grammars/tree-sitter-kotlin',
    version: '1.1.0',
    wasm: 'tree-sitter-kotlin.wasm',
    queries: [],
  },
  {
    id: 'scala',
    pkg: 'tree-sitter-scala',
    version: '0.24.0',
    wasm: 'tree-sitter-scala.wasm',
    queries: [tags('tree-sitter-scala', '0.24.0')],
  },
  {
    id: 'go',
    pkg: 'tree-sitter-go',
    version: '0.25.0',
    wasm: 'tree-sitter-go.wasm',
    queries: [tags('tree-sitter-go', '0.25.0')],
  },
  {
    id: 'csharp',
    pkg: 'tree-sitter-c-sharp',
    version: '0.23.5',
    wasm: 'tree-sitter-c_sharp.wasm',
    queries: [tags('tree-sitter-c-sharp', '0.23.5')],
  },
  {
    id: 'javascript',
    pkg: 'tree-sitter-javascript',
    version: '0.25.0',
    wasm: 'tree-sitter-javascript.wasm',
    queries: [JS],
  },
  {
    id: 'typescript',
    pkg: 'tree-sitter-typescript',
    version: '0.23.2',
    wasm: 'tree-sitter-typescript.wasm',
    queries: [JS, TS],
  },
  {
    id: 'tsx',
    pkg: 'tree-sitter-typescript',
    version: '0.23.2',
    wasm: 'tree-sitter-tsx.wasm',
    queries: [JS, TS],
  },
  {
    id: 'python',
    pkg: 'tree-sitter-python',
    version: '0.25.0',
    wasm: 'tree-sitter-python.wasm',
    queries: [tags('tree-sitter-python', '0.25.0')],
  },
  {
    id: 'php',
    pkg: 'tree-sitter-php',
    version: '0.24.2',
    wasm: 'tree-sitter-php.wasm',
    queries: [tags('tree-sitter-php', '0.24.2')],
  },
  {
    id: 'ruby',
    pkg: 'tree-sitter-ruby',
    version: '0.23.1',
    wasm: 'tree-sitter-ruby.wasm',
    queries: [tags('tree-sitter-ruby', '0.23.1')],
  },
  {
    id: 'rust',
    pkg: 'tree-sitter-rust',
    version: '0.24.0',
    wasm: 'tree-sitter-rust.wasm',
    queries: [tags('tree-sitter-rust', '0.24.0')],
  },
  {
    id: 'c',
    pkg: 'tree-sitter-c',
    version: '0.24.1',
    wasm: 'tree-sitter-c.wasm',
    queries: [tags('tree-sitter-c', '0.24.1')],
  },
  {
    id: 'cpp',
    pkg: 'tree-sitter-cpp',
    version: '0.23.4',
    wasm: 'tree-sitter-cpp.wasm',
    queries: [tags('tree-sitter-cpp', '0.23.4')],
  },
  {
    id: 'elixir',
    pkg: 'tree-sitter-elixir',
    version: '0.3.5',
    wasm: 'tree-sitter-elixir.wasm',
    queries: [tags('tree-sitter-elixir', '0.3.5')],
  },
];
