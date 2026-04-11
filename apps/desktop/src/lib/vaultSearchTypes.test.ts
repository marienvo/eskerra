import {describe, expect, it} from 'vitest';

import {
  compareVaultSearchNotes,
  type VaultSearchNoteResult,
  vaultSearchBestFieldRank,
} from './vaultSearchTypes';

describe('vaultSearchBestFieldRank', () => {
  it('ranks title before path before body', () => {
    expect(vaultSearchBestFieldRank('title')).toBeLessThan(vaultSearchBestFieldRank('path'));
    expect(vaultSearchBestFieldRank('path')).toBeLessThan(vaultSearchBestFieldRank('body'));
  });
});

describe('compareVaultSearchNotes', () => {
  it('sorts by higher score first', () => {
    const a: VaultSearchNoteResult = {
      uri: '/a.md',
      relativePath: 'a.md',
      title: 'a',
      bestField: 'body',
      matchCount: 1,
      score: 1,
      snippets: [],
    };
    const b: VaultSearchNoteResult = {
      uri: '/b.md',
      relativePath: 'b.md',
      title: 'b',
      bestField: 'body',
      matchCount: 1,
      score: 10,
      snippets: [],
    };
    const sorted = [a, b].sort(compareVaultSearchNotes);
    expect(sorted.map(n => n.uri)).toEqual(['/b.md', '/a.md']);
  });

  it('tie-breaks by bestField then uri', () => {
    const title: VaultSearchNoteResult = {
      uri: '/z.md',
      relativePath: 'z.md',
      title: 'z',
      bestField: 'title',
      matchCount: 1,
      score: 5,
      snippets: [],
    };
    const body: VaultSearchNoteResult = {
      uri: '/a.md',
      relativePath: 'a.md',
      title: 'a',
      bestField: 'body',
      matchCount: 1,
      score: 5,
      snippets: [],
    };
    const sorted = [body, title].sort(compareVaultSearchNotes);
    expect(sorted.map(n => n.bestField)).toEqual(['title', 'body']);
  });
});
