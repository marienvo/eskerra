import type {VaultDirEntry, VaultFilesystem} from '@notebox/core';
import {
  exists,
  listFiles,
  mkdir,
  readFile,
  unlink,
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
  exists,
  mkdir,
  async readFile(uri, options) {
    return readFile(uri, options);
  },
  async writeFile(uri, content, options) {
    return writeFile(uri, content, options);
  },
  unlink,
  async listFiles(directoryUri): Promise<VaultDirEntry[]> {
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
