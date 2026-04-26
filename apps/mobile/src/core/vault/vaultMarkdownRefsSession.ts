import {normalizeVaultBaseUri, stemFromMarkdownFileName, type VaultMarkdownRef} from '@eskerra/core';

import {DEV_MOCK_VAULT_URI, MOCK_NOTES, MOCK_PODCAST_FILES} from '../../dev/mockVaultData';

export function isDevMockVaultBaseUri(baseUri: string): boolean {
  return baseUri.trim() === DEV_MOCK_VAULT_URI;
}

function basenamePosix(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : norm;
}

/** Same stems as desktop vault markdown index for dev mock vault. */
export function buildMockVaultMarkdownRefs(): VaultMarkdownRef[] {
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

export function normalizeVaultMarkdownRefsBaseUri(baseUri: string): string {
  let normalized = normalizeVaultBaseUri(baseUri).replace(/\\/g, '/');
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
