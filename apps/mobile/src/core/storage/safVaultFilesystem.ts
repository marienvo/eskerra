import type {
  VaultDirEntry,
  VaultFilesystem,
  VaultReadOptions,
  VaultWriteOptions,
} from '@notebox/core';
import {
  exists,
  listFiles,
  mkdir as safMkdir,
  readFile,
  rename as safRename,
  unlink as safUnlink,
  writeFile,
} from 'react-native-saf-x';

type SafDocumentFile = {
  lastModified?: number | null;
  name?: string;
  type?: 'directory' | 'file' | string;
  uri: string;
};

/**
 * VaultFilesystem backed by react-native-saf-x (Android SAF URIs).
 */

export const safVaultFilesystem: VaultFilesystem = {
  exists: (uri: string) => exists(uri),
  mkdir: async (uri: string): Promise<void> => {
    await safMkdir(uri);
  },
  readFile: async (uri: string, options: VaultReadOptions): Promise<string> =>
    readFile(uri, options),
  writeFile: async (
    uri: string,
    content: string,
    options: VaultWriteOptions,
  ): Promise<void> => {
    await writeFile(uri, content, options);
  },
  unlink: async (uri: string): Promise<void> => {
    await safUnlink(uri);
  },
  renameFile: async (fromUri: string, toUri: string): Promise<void> => {
    const toName = toUri.split('/').pop()?.trim();
    if (!toName) {
      throw new Error('Invalid rename target path.');
    }
    await safRename(fromUri, toName);
  },
  listFiles: async (directoryUri: string): Promise<VaultDirEntry[]> => {
    const documents = (await listFiles(directoryUri)) as SafDocumentFile[];
    return documents.map(document => ({
      lastModified:
        typeof document.lastModified === 'number' ? document.lastModified : null,
      name: typeof document.name === 'string' ? document.name : '',
      type: document.type,
      uri: document.uri,
    }));
  },
};
