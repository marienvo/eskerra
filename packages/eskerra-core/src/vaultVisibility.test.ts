import {describe, expect, it} from 'vitest';

import type {VaultDirEntry} from './vaultFilesystem';
import {
  filterVaultTreeDirEntries,
  isEligibleVaultMarkdownFileName,
  isVaultTreeHardExcludedDirectoryName,
  isVaultTreeIgnoredEntryName,
  shouldPruneVaultTreeSubdirectory,
  SubtreeMarkdownPresenceCache,
  vaultAncestorDirectoryUrisForSubtreeCacheInvalidation,
  vaultPathDirname,
  VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES,
} from './vaultVisibility';

describe('vault tree name rules', () => {
  it('ignores dot-prefixed names only (underscore prefixes stay visible)', () => {
    expect(isVaultTreeIgnoredEntryName('.git')).toBe(true);
    expect(isVaultTreeIgnoredEntryName('_draft')).toBe(false);
    expect(isVaultTreeIgnoredEntryName('note')).toBe(false);
  });

  it('hard-excludes product directory names case-sensitively', () => {
    expect(isVaultTreeHardExcludedDirectoryName('Assets')).toBe(true);
    expect(isVaultTreeHardExcludedDirectoryName('assets')).toBe(false);
    expect(VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES).toContain('Scripts');
    expect(VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES).toContain('Templates');
  });

  it('eligible markdown files exclude conflicts and dot-prefixed names', () => {
    expect(isEligibleVaultMarkdownFileName('a.md')).toBe(true);
    expect(isEligibleVaultMarkdownFileName('a.sync-conflict.md')).toBe(false);
    expect(isEligibleVaultMarkdownFileName('_x.md')).toBe(true);
    expect(isEligibleVaultMarkdownFileName('.x.md')).toBe(false);
    expect(isEligibleVaultMarkdownFileName('a.txt')).toBe(false);
  });
});

describe('filterVaultTreeDirEntries', () => {
  it('drops ignored entries and hard-excluded directories', () => {
    const entries: VaultDirEntry[] = [
      {name: 'Inbox', uri: '/v/Inbox', type: 'directory', lastModified: null},
      {name: 'Assets', uri: '/v/Assets', type: 'directory', lastModified: null},
      {name: '.stfolder', uri: '/v/.stfolder', type: 'directory', lastModified: null},
      {name: '_autosync', uri: '/v/_autosync', type: 'directory', lastModified: null},
      {name: 'ok.md', uri: '/v/ok.md', type: 'file', lastModified: null},
    ];
    expect(filterVaultTreeDirEntries(entries)).toEqual([
      {name: 'Inbox', uri: '/v/Inbox', type: 'directory', lastModified: null},
      {name: '_autosync', uri: '/v/_autosync', type: 'directory', lastModified: null},
      {name: 'ok.md', uri: '/v/ok.md', type: 'file', lastModified: null},
    ]);
  });
});

describe('shouldPruneVaultTreeSubdirectory', () => {
  it('never prunes empty directories after filters', () => {
    expect(
      shouldPruneVaultTreeSubdirectory({
        filteredChildEntries: [],
        subtreeHasEligibleMarkdown: false,
      }),
    ).toBe(false);
  });

  it('hides non-empty folders with no markdown in subtree', () => {
    const child: VaultDirEntry = {
      name: 'only-dir',
      uri: '/v/a',
      type: 'directory',
      lastModified: null,
    };
    expect(
      shouldPruneVaultTreeSubdirectory({
        filteredChildEntries: [child],
        subtreeHasEligibleMarkdown: false,
      }),
    ).toBe(true);
  });
});

describe('vaultPathDirname', () => {
  it('returns parent for nested paths', () => {
    expect(vaultPathDirname('/vault/Inbox/n.md')).toBe('/vault/Inbox');
    expect(vaultPathDirname('/vault/Inbox')).toBe('/vault');
  });
});

describe('vaultAncestorDirectoryUrisForSubtreeCacheInvalidation', () => {
  it('lists ancestors for file mutations', () => {
    expect(
      vaultAncestorDirectoryUrisForSubtreeCacheInvalidation(
        '/vault',
        '/vault/Inbox/sub/n.md',
        'file',
      ),
    ).toEqual(['/vault/Inbox/sub', '/vault/Inbox', '/vault']);
  });

  it('lists from directory path for directory mutations', () => {
    expect(
      vaultAncestorDirectoryUrisForSubtreeCacheInvalidation('/vault', '/vault/Inbox/sub', 'directory'),
    ).toEqual(['/vault/Inbox/sub', '/vault/Inbox', '/vault']);
  });
});

describe('SubtreeMarkdownPresenceCache', () => {
  it('invalidates ancestor chain', () => {
    const c = new SubtreeMarkdownPresenceCache();
    c.set('/vault/Inbox', true);
    c.set('/vault', false);
    c.invalidateForMutation('/vault', '/vault/Inbox/a.md', 'file');
    expect(c.get('/vault/Inbox')).toBeUndefined();
    expect(c.get('/vault')).toBeUndefined();
  });

  it('invalidateAll clears entries', () => {
    const c = new SubtreeMarkdownPresenceCache();
    c.set('/vault', true);
    c.invalidateAll();
    expect(c.get('/vault')).toBeUndefined();
  });
});
