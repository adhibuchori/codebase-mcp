import { expect, test } from 'bun:test';
import { buildTree, findFolder, keyFiles, renderTree } from '../repo-tree.ts';

const PATHS = [
  'README.md',
  'src/main/App.java',
  'src/main/Util.java',
  'src/test/AppTest.java',
  'docs/a.md',
  'ops/Dockerfile',
  'web/index.ts',
];

test('folders count every file below them', () => {
  const root = buildTree(PATHS);
  expect(root.files).toBe(7);
  expect(findFolder(root, 'src')?.files).toBe(3);
  expect(findFolder(root, 'src/main/')?.files).toBe(2);
  expect(findFolder(root, 'nope')).toBeUndefined();
  expect(findFolder(root, '')).toBe(root);
});

test('biggest folders first, then by name; extra folders are summed up', () => {
  const root = buildTree(PATHS);
  expect(renderTree(root, { depth: 2, width: 2, indent: '' })).toEqual([
    'src/ (3)',
    '  main/ (2)',
    '  test/ (1)',
    'docs/ (1)',
    '… 2 more folders (2 files)',
  ]);
  expect(renderTree(root, { depth: 0, width: 5, indent: '' })).toEqual([]);
});

test('key files: build files, contracts and entrypoints, shallowest first', () => {
  expect(
    keyFiles([
      'src/server.ts',
      'package.json',
      'api/openapi.yaml',
      'src/util.ts',
      'deploy/Dockerfile.prod',
      'cmd/api/main.go',
    ]),
  ).toEqual([
    'package.json',
    'api/openapi.yaml',
    'deploy/Dockerfile.prod',
    'src/server.ts',
    'cmd/api/main.go',
  ]);
  expect(keyFiles(['a/pom.xml', 'b/pom.xml'], 1)).toEqual(['a/pom.xml']);
});
