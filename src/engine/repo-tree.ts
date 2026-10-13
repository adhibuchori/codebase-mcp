/**
 * A folder map of a repo built from its file list: each folder with how many files it holds below
 * it, wide folders collapsed, and the files that explain a service (build files, entrypoints,
 * Dockerfiles, API contracts) listed separately. Far cheaper than a full tree listing.
 */
export interface FolderNode {
  readonly name: string;
  files: number;
  readonly children: Map<string, FolderNode>;
}

export function buildTree(paths: readonly string[]): FolderNode {
  const root: FolderNode = { name: '', files: 0, children: new Map() };
  for (const path of paths) {
    const segments = path.split('/');
    let node = root;
    node.files++;
    for (const segment of segments.slice(0, -1)) {
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, files: 0, children: new Map() };
        node.children.set(segment, child);
      }
      child.files++;
      node = child;
    }
  }
  return root;
}

export function findFolder(root: FolderNode, path: string): FolderNode | undefined {
  let node: FolderNode | undefined = root;
  for (const segment of path.split('/').filter(Boolean)) node = node?.children.get(segment);
  return node;
}

export interface TreeView {
  readonly depth: number;
  readonly width: number;
  readonly indent: string;
}

/** Indented "name/ (N files)" lines, biggest folders first, at most `width` children per folder. */
export function renderTree(node: FolderNode, view: TreeView): string[] {
  if (view.depth <= 0) return [];
  const children = [...node.children.values()].toSorted(
    (a, b) => b.files - a.files || a.name.localeCompare(b.name),
  );
  const lines: string[] = [];
  for (const child of children.slice(0, view.width)) {
    lines.push(`${view.indent}${child.name}/ (${child.files})`);
    lines.push(
      ...renderTree(child, {
        depth: view.depth - 1,
        width: view.width,
        indent: `${view.indent}  `,
      }),
    );
  }
  const rest = children.slice(view.width);
  const indent = view.indent;
  if (rest.length > 0)
    lines.push(
      `${indent}… ${rest.length} more folders (${rest.reduce((sum, child) => sum + child.files, 0)} files)`,
    );
  return lines;
}

const KEY_FILE =
  /(^|\/)(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|go\.mod|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|Pipfile|[^/]+\.csproj|[^/]+\.sln|composer\.json|Gemfile|mix\.exs|Package\.swift|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Makefile|Chart\.yaml|README\.md|openapi[^/]*\.(ya?ml|json)|swagger[^/]*\.(ya?ml|json)|[^/]+\.proto|[^/]+\.graphql|application\.(ya?ml|properties))$/i;

const ENTRYPOINT =
  /(^|\/)(main\.go|[A-Z]\w*Application\.(java|kt)|main\.(ts|js|py|rs|kt)|index\.(ts|js)|server\.(ts|js)|app\.(ts|js|py)|manage\.py|wsgi\.py|asgi\.py|Program\.cs|Startup\.cs|lib\.rs|index\.php|config\.ru)$/;

/** Build files, contracts and entrypoints, shallowest first. */
export function keyFiles(paths: readonly string[], max = 25): string[] {
  const picked = paths.filter((path) => KEY_FILE.test(path) || ENTRYPOINT.test(path));
  return picked
    .toSorted((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, max);
}
