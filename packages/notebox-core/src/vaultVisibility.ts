import type {VaultDirEntry} from './vaultFilesystem';
import {isSyncConflictFileName, MARKDOWN_EXTENSION} from './vaultLayout';

/** Directory names excluded from the vault tree (product layout; Linux: case-sensitive). */
export const VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES = [
  'Assets',
  'Excalidraw',
  'Scripts',
  'Templates',
] as const;

const HARD_EXCLUDED_SET = new Set<string>(VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES);

export function isVaultTreeIgnoredEntryName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_');
}

export function isVaultTreeHardExcludedDirectoryName(name: string): boolean {
  return HARD_EXCLUDED_SET.has(name);
}

export function isEligibleVaultMarkdownFileName(fileName: string): boolean {
  if (!fileName.endsWith(MARKDOWN_EXTENSION)) {
    return false;
  }
  if (isSyncConflictFileName(fileName)) {
    return false;
  }
  if (isVaultTreeIgnoredEntryName(fileName)) {
    return false;
  }
  return true;
}

/** Applies tree listing rules: drop ignored names and hard-excluded directories (non-recursive). */
export function filterVaultTreeDirEntries(entries: readonly VaultDirEntry[]): VaultDirEntry[] {
  return entries.filter(entry => {
    if (isVaultTreeIgnoredEntryName(entry.name)) {
      return false;
    }
    if (
      entry.type === 'directory' &&
      isVaultTreeHardExcludedDirectoryName(entry.name)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Whether a child folder row should be hidden when it is non-empty after filters but has no eligible
 * markdown anywhere underneath.
 */
export function shouldPruneVaultTreeSubdirectory(options: {
  filteredChildEntries: readonly VaultDirEntry[];
  subtreeHasEligibleMarkdown: boolean;
}): boolean {
  if (options.filteredChildEntries.length === 0) {
    return false;
  }
  return !options.subtreeHasEligibleMarkdown;
}

export type VaultPathKindForInvalidation = 'file' | 'directory';

function normalizeVaultPathSlashes(uri: string): string {
  return uri.trim().replace(/\\/g, '/');
}

/** Parent path using forward slashes (sufficient for vault URI strings on desktop and SAF). */
export function vaultPathDirname(uri: string): string {
  const norm = normalizeVaultPathSlashes(uri).replace(/\/+$/, '');
  const i = norm.lastIndexOf('/');
  if (i < 0) {
    return norm;
  }
  if (i === 0) {
    return '/';
  }
  return norm.slice(0, i);
}

/**
 * Directory URIs that must drop any memoized `subtreeHasVisibleMarkdown` (or equivalent) when a path
 * under the vault changes. Includes every ancestor up to and including `vaultRootUri`.
 */
export function vaultAncestorDirectoryUrisForSubtreeCacheInvalidation(
  vaultRootUri: string,
  pathUri: string,
  kind: VaultPathKindForInvalidation,
): string[] {
  const root = normalizeVaultPathSlashes(vaultRootUri).replace(/\/+$/, '');
  const full = normalizeVaultPathSlashes(pathUri);
  if (full !== root && !full.startsWith(`${root}/`)) {
    return [];
  }
  let startDir =
    kind === 'file' ? vaultPathDirname(full) : full.replace(/\/+$/, '');
  if (startDir.length < root.length) {
    return [];
  }
  const out: string[] = [];
  let current: string | null = startDir;
  while (current != null && current.length >= root.length) {
    out.push(current);
    if (current === root) {
      break;
    }
    const next = vaultPathDirname(current);
    current = next.length < root.length ? null : next;
  }
  return out;
}

/**
 * Memo store for subtree markdown presence. Invalidation removes a directory key and optionally
 * clears everything (for example on external `vault-files-changed` without path detail).
 */
export class SubtreeMarkdownPresenceCache {
  private readonly cache = new Map<string, boolean>();

  get(dirUri: string): boolean | undefined {
    return this.cache.get(normalizeVaultPathSlashes(dirUri).replace(/\/+$/, ''));
  }

  set(dirUri: string, value: boolean): void {
    const key = normalizeVaultPathSlashes(dirUri).replace(/\/+$/, '');
    this.cache.set(key, value);
  }

  invalidatePaths(dirUris: readonly string[]): void {
    for (const raw of dirUris) {
      const key = normalizeVaultPathSlashes(raw).replace(/\/+$/, '');
      this.cache.delete(key);
    }
  }

  invalidateForMutation(
    vaultRootUri: string,
    mutatedPathUri: string,
    kind: VaultPathKindForInvalidation,
  ): void {
    this.invalidatePaths(
      vaultAncestorDirectoryUrisForSubtreeCacheInvalidation(
        vaultRootUri,
        mutatedPathUri,
        kind,
      ),
    );
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
