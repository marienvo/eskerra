import {describe, expect, it} from 'vitest';

import {compareVaultSearchHits, type VaultSearchHit, vaultSearchHitTierRank} from './vaultSearchTypes';

describe('vaultSearchHitTierRank', () => {
  it('ranks exact filename hits before partial and body', () => {
    const exact: VaultSearchHit = {
      uri: '/a/x.md',
      lineNumber: 0,
      snippet: '',
      filenameMatch: 'exact',
    };
    const partial: VaultSearchHit = {
      uri: '/a/y.md',
      lineNumber: 0,
      snippet: '',
      filenameMatch: 'partial',
    };
    const body: VaultSearchHit = {uri: '/a/z.md', lineNumber: 3, snippet: ''};
    expect(vaultSearchHitTierRank(exact)).toBeLessThan(vaultSearchHitTierRank(partial));
    expect(vaultSearchHitTierRank(partial)).toBeLessThan(vaultSearchHitTierRank(body));
  });
});

describe('compareVaultSearchHits', () => {
  it('sorts by tier then path then line', () => {
    const hits: VaultSearchHit[] = [
      {uri: '/vault/b.md', lineNumber: 1, snippet: 'b'},
      {uri: '/vault/a.md', lineNumber: 0, snippet: '', filenameMatch: 'partial'},
      {uri: '/vault/c.md', lineNumber: 0, snippet: '', filenameMatch: 'exact'},
    ];
    const sorted = [...hits].sort(compareVaultSearchHits);
    expect(sorted.map(h => `${h.uri}:${h.lineNumber}:${h.filenameMatch ?? '-'}`)).toEqual([
      '/vault/c.md:0:exact',
      '/vault/a.md:0:partial',
      '/vault/b.md:1:-',
    ]);
  });
});
