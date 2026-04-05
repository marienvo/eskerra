import {describe, expect, it} from 'vitest';

import {pickLonelySubfolderWhenNoMarkdown} from './vaultTreeAutoExpandThroughSparseFolders';
import type {VaultTreeItemData} from './vaultTreeLoadChildren';

function folder(id: string, name: string): VaultTreeItemData {
  return {kind: 'folder', name, uri: id, lastModified: null};
}

function article(id: string, name: string): VaultTreeItemData {
  return {kind: 'article', name, uri: id, lastModified: null};
}

describe('pickLonelySubfolderWhenNoMarkdown', () => {
  it('returns the only subfolder when there are no articles', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/a': folder('/v/a', 'a'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/a'], store)).toBe('/v/a');
  });

  it('returns null when there are two subfolders and no articles', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/a': folder('/v/a', 'a'),
      '/v/b': folder('/v/b', 'b'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/a', '/v/b'], store)).toBeNull();
  });

  it('returns null when there is at least one article', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/sub': folder('/v/sub', 'sub'),
      '/v/n.md': article('/v/n.md', 'n.md'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/sub', '/v/n.md'], store)).toBeNull();
  });

  it('returns null when there is only a markdown file', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/n.md': article('/v/n.md', 'n.md'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/n.md'], store)).toBeNull();
  });

  it('returns null for an empty directory', () => {
    expect(pickLonelySubfolderWhenNoMarkdown([], {})).toBeNull();
  });

  it('returns null when parent path depth is at or above maxDepth', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/1/2/3/single': folder('/1/2/3/single', 'single'),
    };
    expect(
      pickLonelySubfolderWhenNoMarkdown(['/1/2/3/single'], store, {
        parentUri: '/1/2/3',
        maxDepth: 3,
      }),
    ).toBeNull();
    expect(
      pickLonelySubfolderWhenNoMarkdown(['/1/2/3/single'], store, {
        parentUri: '/1/2',
        maxDepth: 3,
      }),
    ).toBe('/1/2/3/single');
  });

  it('ignores child ids missing from the store when counting folders', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/real': folder('/v/real', 'real'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/ghost', '/v/real'], store)).toBe('/v/real');
  });
});
