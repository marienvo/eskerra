import type {VaultMarkdownRef} from '@eskerra/core';

import {useVaultContext, type VaultMarkdownRefsStatus} from '../../../core/vault/VaultContext';

export type UseVaultMarkdownRefsResult = {
  vaultMarkdownRefs: readonly VaultMarkdownRef[];
  isVaultMarkdownRefsLoading: boolean;
  vaultMarkdownRefsError: string | null;
  vaultMarkdownRefsStatus: VaultMarkdownRefsStatus;
  refreshVaultMarkdownRefs: () => void;
};

/**
 * Vault-wide eligible `.md` paths for wiki-style `[[...]]` resolution (shared per vault session).
 */
export function useVaultMarkdownRefs(): UseVaultMarkdownRefsResult {
  const {
    vaultMarkdownRefs,
    vaultMarkdownRefsStatus,
    vaultMarkdownRefsError,
    refreshVaultMarkdownRefs,
  } = useVaultContext();

  return {
    vaultMarkdownRefs,
    isVaultMarkdownRefsLoading: vaultMarkdownRefsStatus === 'loading',
    vaultMarkdownRefsError,
    vaultMarkdownRefsStatus,
    refreshVaultMarkdownRefs,
  };
}
