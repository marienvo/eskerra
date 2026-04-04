/**
 * Platform-agnostic vault file access (SAF URIs on Android, POSIX paths on desktop).
 */

export type VaultDirEntry = {
  lastModified: number | null;
  name: string;
  type?: 'directory' | 'file' | string;
  uri: string;
};

export type VaultWriteOptions = {
  encoding: 'utf8';
  mimeType?: string;
};

export type VaultReadOptions = {
  encoding: 'utf8';
};

export interface VaultFilesystem {
  exists(uri: string): Promise<boolean>;
  mkdir(uri: string): Promise<void>;
  readFile(uri: string, options: VaultReadOptions): Promise<string>;
  writeFile(uri: string, content: string, options: VaultWriteOptions): Promise<void>;
  unlink(uri: string): Promise<void>;
  /** Recursively deletes a directory and all contents inside the vault. */
  removeTree(directoryUri: string): Promise<void>;
  renameFile(fromUri: string, toUri: string): Promise<void>;
  listFiles(directoryUri: string): Promise<VaultDirEntry[]>;
}
