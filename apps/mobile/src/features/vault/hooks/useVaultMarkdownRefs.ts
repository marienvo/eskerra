import {
  collectVaultMarkdownRefs,
  normalizeVaultBaseUri,
  stemFromMarkdownFileName,
  type VaultMarkdownRef,
} from '@eskerra/core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {InteractionManager} from 'react-native';

import {DEV_MOCK_VAULT_URI, MOCK_NOTES, MOCK_PODCAST_FILES} from '../../../dev/mockVaultData';
import {safVaultFilesystem} from '../../../core/storage/safVaultFilesystem';

function isDevMockVaultBaseUri(baseUri: string | null): boolean {
  return baseUri != null && baseUri.trim() === DEV_MOCK_VAULT_URI;
}

function basenamePosix(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : norm;
}

function mockVaultMarkdownRefs(): VaultMarkdownRef[] {
  const out: VaultMarkdownRef[] = [];
  for (const n of MOCK_NOTES) {
    out.push({
      name: stemFromMarkdownFileName(basenamePosix(n.name)),
      uri: `${DEV_MOCK_VAULT_URI}/${n.name.replace(/\\/g, '/')}`,
    });
  }
  for (const p of MOCK_PODCAST_FILES) {
    const base = basenamePosix(p.name);
    out.push({
      name: stemFromMarkdownFileName(base),
      uri: `${DEV_MOCK_VAULT_URI}/${p.name.replace(/\\/g, '/')}`,
    });
  }
  out.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    return byName !== 0 ? byName : a.uri.localeCompare(b.uri);
  });
  return out;
}

export type UseVaultMarkdownRefsResult = {
  vaultMarkdownRefs: VaultMarkdownRef[];
  isVaultMarkdownRefsLoading: boolean;
  vaultMarkdownRefsError: string | null;
  refreshVaultMarkdownRefs: () => void;
};

/**
 * Vault-wide eligible markdown paths for wiki-style `[[...]]` resolution (same walk as desktop index).
 */
export function useVaultMarkdownRefs(baseUri: string | null): UseVaultMarkdownRefsResult {
  const [refs, setRefs] = useState<VaultMarkdownRef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refreshVaultMarkdownRefs = useCallback(() => {
    setRefreshNonce(n => n + 1);
  }, []);

  const normalizedBase = useMemo(() => {
    if (baseUri == null || baseUri.trim() === '') {
      return null;
    }
    return normalizeVaultBaseUri(baseUri).replace(/\\/g, '/').replace(/\/+$/, '');
  }, [baseUri]);

  useEffect(() => {
    abortRef.current?.abort();
    if (normalizedBase == null) {
      setRefs([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (isDevMockVaultBaseUri(normalizedBase)) {
      setRefs(mockVaultMarkdownRefs());
      setIsLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setError(null);

    const cancelable = InteractionManager.runAfterInteractions(() => {
      collectVaultMarkdownRefs(normalizedBase, safVaultFilesystem, {signal: ac.signal})
        .then(rows => {
          if (!ac.signal.aborted) {
            setRefs(rows);
          }
        })
        .catch(e => {
          if (ac.signal.aborted) {
            return;
          }
          if (e instanceof Error && e.name === 'AbortError') {
            return;
          }
          const message = e instanceof Error ? e.message : 'Could not index vault notes.';
          setError(message);
          setRefs([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      ac.abort();
      cancelable.cancel();
    };
  }, [normalizedBase, refreshNonce]);

  return {
    vaultMarkdownRefs: refs,
    isVaultMarkdownRefsLoading: isLoading,
    vaultMarkdownRefsError: error,
    refreshVaultMarkdownRefs,
  };
}
