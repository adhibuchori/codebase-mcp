/** FileSystem port on node:fs/promises, which Bun and Node both implement. */
import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { DirEntry, FileStat, FileSystem } from '../../ports/file-system.ts';

async function readHead(path: string, bytes: number): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function statOrNull(path: string): Promise<FileStat | null> {
  try {
    const info = await stat(path);
    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    };
  } catch {
    return null;
  }
}

async function readDirEntries(path: string): Promise<readonly DirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink(),
  }));
}

export function createNodeFileSystem(): FileSystem {
  return {
    realpath: async (path) => {
      try {
        return await realpath(path);
      } catch {
        return null;
      }
    },
    stat: statOrNull,
    readText: (path) => readFile(path, 'utf8'),
    readHead,
    readDir: readDirEntries,
  };
}
