/** Port: the file system, as engine/ and indexer/ see it. Implemented by adapters/fs/node-file-system.ts. */

export interface FileStat {
  readonly size: number;
  readonly mtimeMs: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
}

export interface DirEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
}

export interface FileSystem {
  /** Real path with symlinks resolved, or null when the path does not exist. */
  realpath(path: string): Promise<string | null>;
  stat(path: string): Promise<FileStat | null>;
  readText(path: string): Promise<string>;
  /** The first `bytes` bytes, for binary sniffing. */
  readHead(path: string, bytes: number): Promise<Uint8Array>;
  readDir(path: string): Promise<readonly DirEntry[]>;
}
