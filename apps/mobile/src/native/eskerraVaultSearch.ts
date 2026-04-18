import {NativeModules, Platform} from 'react-native';

import {DEV_MOCK_VAULT_URI} from '../dev/mockVaultData';

export type VaultSearchOpenResult = {
  vaultInstanceId: string;
  baseUriHash: string;
  schemaVersion: number;
  indexReady: boolean;
  isBuilding: boolean;
  /** False while title rows exist but body column is still being filled (incremental index). */
  bodiesIndexReady?: boolean;
  /** When true, [readVaultMarkdownNotes] reflects a complete registry (not a partial incremental fill). */
  notesRegistryReady?: boolean;
  indexedNotes: number;
  lastFullBuildAt: number;
  lastReconciledAt: number;
};

export type VaultMarkdownNoteRegistryRow = {
  lookupName: string;
  displayName: string;
  uri: string;
};

type NativeModule = {
  open: (baseUri: string) => Promise<VaultSearchOpenResult>;
  getIndexStatus: (baseUri: string) => Promise<VaultSearchOpenResult>;
  persistActiveVaultUriForWorker: (uri: string) => Promise<void>;
  scheduleFullRebuild: (baseUri: string, reason: string) => Promise<void>;
  reconcile: (baseUri: string) => Promise<void>;
  touchPaths: (baseUri: string, paths: string[]) => Promise<void>;
  readVaultMarkdownNotes?: (baseUri: string) => Promise<VaultMarkdownNoteRegistryRow[]>;
  touchMarkdownNotes?: (baseUri: string, uris: string[]) => Promise<void>;
  start: (baseUri: string, searchId: string, query: string) => Promise<void>;
  cancel: () => Promise<void>;
};

function getNative(): NativeModule | undefined {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  const mod = (NativeModules as {EskerraVaultSearch?: NativeModule}).EskerraVaultSearch;
  return mod;
}

export const eskerraVaultSearch = {
  isAvailable(): boolean {
    return getNative() != null;
  },
  open(baseUri: string): Promise<VaultSearchOpenResult> {
    const n = getNative();
    if (!n) {
      return Promise.reject(new Error('EskerraVaultSearch native module unavailable'));
    }
    return n.open(baseUri);
  },
  getIndexStatus(baseUri: string): Promise<VaultSearchOpenResult> {
    const n = getNative();
    if (!n) {
      return Promise.reject(new Error('EskerraVaultSearch native module unavailable'));
    }
    return n.getIndexStatus(baseUri);
  },
  persistActiveVaultUriForWorker(uri: string): Promise<void> {
    return getNative()?.persistActiveVaultUriForWorker(uri) ?? Promise.resolve();
  },
  scheduleFullRebuild(baseUri: string, reason: string): Promise<void> {
    return getNative()?.scheduleFullRebuild(baseUri, reason) ?? Promise.resolve();
  },
  reconcile(baseUri: string): Promise<void> {
    return getNative()?.reconcile(baseUri) ?? Promise.resolve();
  },
  touchPaths(baseUri: string, paths: string[]): Promise<void> {
    return getNative()?.touchPaths(baseUri, paths) ?? Promise.resolve();
  },
  readVaultMarkdownNotes(baseUri: string): Promise<VaultMarkdownNoteRegistryRow[]> {
    const n = getNative();
    if (!n?.readVaultMarkdownNotes) {
      return Promise.resolve([]);
    }
    return n.readVaultMarkdownNotes(baseUri);
  },
  start(baseUri: string, searchId: string, query: string): Promise<void> {
    const n = getNative();
    if (!n) {
      return Promise.reject(new Error('EskerraVaultSearch native module unavailable'));
    }
    return n.start(baseUri, searchId, query);
  },
  cancel(): Promise<void> {
    return getNative()?.cancel() ?? Promise.resolve();
  },
};

/** After inbox / vault note writes or deletes; no-op on non-Android, mock vault, or missing native. */
export async function touchVaultSearchNoteUris(
  baseUri: string | null | undefined,
  paths: readonly string[],
): Promise<void> {
  if (baseUri == null || baseUri.trim() === '' || paths.length === 0) {
    return;
  }
  if (baseUri.trim() === DEV_MOCK_VAULT_URI) {
    return;
  }
  if (!eskerraVaultSearch.isAvailable()) {
    return;
  }
  await eskerraVaultSearch.touchPaths(baseUri.trim(), [...paths]).catch(() => undefined);
}

/** Lightweight markdown notes registry sync (Android); no-op when unavailable. */
export async function touchMarkdownNoteUris(
  baseUri: string | null | undefined,
  uris: readonly string[],
): Promise<void> {
  if (baseUri == null || baseUri.trim() === '' || uris.length === 0) {
    return;
  }
  if (baseUri.trim() === DEV_MOCK_VAULT_URI) {
    return;
  }
  const n = getNative();
  if (!n?.touchMarkdownNotes) {
    return;
  }
  await n.touchMarkdownNotes(baseUri.trim(), [...uris]).catch(() => undefined);
}
