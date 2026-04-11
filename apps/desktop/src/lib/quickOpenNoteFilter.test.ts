import {describe, expect, it} from 'vitest';

import {
  filterVaultNotesForQuickOpen,
  quickOpenVaultRelativePath,
} from './quickOpenNoteFilter';

describe('quickOpenVaultRelativePath', () => {
  it('strips vault root prefix', () => {
    const rel = quickOpenVaultRelativePath(
      'file:///vault',
      'file:///vault/Inbox/Note.md',
    );
    expect(rel).toBe('Inbox/Note.md');
  });

  it('falls back to file name when prefix mismatches', () => {
    expect(quickOpenVaultRelativePath('file:///a', 'file:///other/b.md')).toBe('b.md');
  });
});

describe('filterVaultNotesForQuickOpen', () => {
  const vault = 'file:///v';
  const refs = [
    {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
    {name: 'Beta', uri: 'file:///v/General/Beta.md'},
  ];

  it('returns no rows when query empty or whitespace', () => {
    expect(filterVaultNotesForQuickOpen('', vault, refs)).toEqual([]);
    expect(filterVaultNotesForQuickOpen('   ', vault, refs)).toEqual([]);
  });

  it('matches stem substring', () => {
    expect(filterVaultNotesForQuickOpen('alp', vault, refs)).toEqual([
      {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
    ]);
  });

  it('matches path substring', () => {
    expect(filterVaultNotesForQuickOpen('general', vault, refs)).toEqual([
      {name: 'Beta', uri: 'file:///v/General/Beta.md'},
    ]);
  });

  it('is case insensitive', () => {
    expect(filterVaultNotesForQuickOpen('ALPHA', vault, refs)).toEqual([
      {name: 'Alpha', uri: 'file:///v/Inbox/Alpha.md'},
    ]);
  });
});
