import {describe, expect, it} from 'vitest';

import {
  buildSparseLonelyExpandPlan,
  pickLonelySubfolderWhenNoMarkdown,
} from './vaultTreeAutoExpandThroughSparseFolders';
import type {VaultTreeItemData} from './vaultTreeLoadChildren';

function folder(id: string, name: string): VaultTreeItemData {
  return {kind: 'folder', name, uri: id, lastModified: null};
}

function article(id: string, name: string): VaultTreeItemData {
  return {kind: 'article', name, uri: id, lastModified: null};
}

function todayHub(id: string, name: string, todayNoteUri: string): VaultTreeItemData {
  return {kind: 'todayHub', name, uri: id, lastModified: null, todayNoteUri};
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

  it('returns null when there is a todayHub row', () => {
    const store: Record<string, VaultTreeItemData> = {
      '/v/d': todayHub('/v/d', 'd', '/v/d/Today.md'),
    };
    expect(pickLonelySubfolderWhenNoMarkdown(['/v/d'], store)).toBeNull();
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

describe('buildSparseLonelyExpandPlan', () => {
  it('returns one batch when the lonely folder has no deeper lonely segment', async () => {
    const itemStoreRef: {current: Record<string, VaultTreeItemData>} = {
      current: {},
    };
    itemStoreRef.current['/v/a'] = folder('/v/a', 'a');
    itemStoreRef.current['/v/a/b.md'] = article('/v/a/b.md', 'b.md');

    const plan = await buildSparseLonelyExpandPlan({
      firstLonelyUri: '/v/a',
      itemStoreRef,
      loadChildRows: async parentUri => {
        if (parentUri === '/v/a') {
          return [{id: '/v/a/b.md', data: itemStoreRef.current['/v/a/b.md']!}];
        }
        return [];
      },
    });

    expect(plan.expandChain).toEqual(['/v/a']);
    expect(plan.cacheBatches).toHaveLength(1);
    expect(plan.cacheBatches[0].parentUri).toBe('/v/a');
  });

  it('chains through two lonely folders then stops at markdown', async () => {
    const itemStoreRef: {current: Record<string, VaultTreeItemData>} = {
      current: {},
    };
    itemStoreRef.current['/v/e'] = folder('/v/e', 'e');
    itemStoreRef.current['/v/e/f'] = folder('/v/e/f', 'f');
    itemStoreRef.current['/v/e/f/n.md'] = article('/v/e/f/n.md', 'n.md');

    const plan = await buildSparseLonelyExpandPlan({
      firstLonelyUri: '/v/e',
      itemStoreRef,
      loadChildRows: async parentUri => {
        if (parentUri === '/v/e') {
          return [{id: '/v/e/f', data: itemStoreRef.current['/v/e/f']!}];
        }
        if (parentUri === '/v/e/f') {
          return [{id: '/v/e/f/n.md', data: itemStoreRef.current['/v/e/f/n.md']!}];
        }
        return [];
      },
    });

    expect(plan.expandChain).toEqual(['/v/e', '/v/e/f']);
    expect(plan.cacheBatches).toHaveLength(2);
  });
});
