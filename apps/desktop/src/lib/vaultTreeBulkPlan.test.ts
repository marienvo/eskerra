import {describe, expect, it} from 'vitest';

import {
  filterVaultTreeBulkMoveSources,
  normalizeVaultTreePath,
  planVaultTreeBulkTargets,
} from './vaultTreeBulkPlan';

describe('vaultTreeBulkPlan', () => {
  const root = '/vault';

  it('normalizeVaultTreePath trims slashes and backslashes', () => {
    expect(normalizeVaultTreePath('/vault\\foo\\\\')).toBe('/vault/foo');
  });

  it('planVaultTreeBulkTargets excludes vault root, collapses children under selected folders, deepest first', () => {
    const plan = planVaultTreeBulkTargets(
      [
        {uri: '/vault', kind: 'folder'},
        {uri: '/vault/A', kind: 'folder'},
        {uri: '/vault/A/x.md', kind: 'article'},
        {uri: '/vault/B.md', kind: 'article'},
      ],
      root,
    );
    expect(plan.map(p => p.uri)).toEqual(['/vault/A', '/vault/B.md']);
  });

  it('planVaultTreeBulkTargets drops descendants when ancestor folder is selected', () => {
    const plan = planVaultTreeBulkTargets(
      [
        {uri: '/vault/Par/child.md', kind: 'article'},
        {uri: '/vault/Par', kind: 'folder'},
      ],
      root,
    );
    expect(plan).toEqual([{uri: '/vault/Par', kind: 'folder'}]);
  });

  it('filterVaultTreeBulkMoveSources removes items already under target', () => {
    const filtered = filterVaultTreeBulkMoveSources(
      [
        {uri: '/vault/Target/here.md', kind: 'article'},
        {uri: '/vault/Other.md', kind: 'article'},
      ],
      '/vault/Target',
      root,
    );
    expect(filtered.map(p => p.uri)).toEqual(['/vault/Other.md']);
  });

  it('filterVaultTreeBulkMoveSources rejects moving folder into its subtree', () => {
    const filtered = filterVaultTreeBulkMoveSources(
      [{uri: '/vault/Par', kind: 'folder'}],
      '/vault/Par/sub',
      root,
    );
    expect(filtered).toEqual([]);
  });
});
