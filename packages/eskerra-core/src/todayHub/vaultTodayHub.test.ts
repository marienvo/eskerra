import {describe, expect, it} from 'vitest';

import {
  sortedTodayHubNoteUrisFromRefs,
  todayHubFolderLabelFromUri,
  vaultMarkdownRefIsTodayHubNote,
  vaultUriIsTodayMarkdownFile,
} from './vaultTodayHub';

describe('vaultUriIsTodayMarkdownFile', () => {
  it('matches Today.md path segments', () => {
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Today.md')).toBe(true);
    expect(vaultUriIsTodayMarkdownFile('C:\\vault\\Work\\Today.md')).toBe(true);
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Note.md')).toBe(false);
    expect(vaultUriIsTodayMarkdownFile('/vault/Work/Today-backup.md')).toBe(false);
  });
});

describe('sortedTodayHubNoteUrisFromRefs', () => {
  it('filters and sorts Today.md paths', () => {
    expect(
      sortedTodayHubNoteUrisFromRefs([
        {name: 'Today', uri: '/v/B/Today.md'},
        {name: 'Today', uri: '/v/A/Today.md'},
        {name: 'x', uri: '/v/x.md'},
      ]),
    ).toEqual(['/v/A/Today.md', '/v/B/Today.md']);
  });

  it('includes Today hub when URI is opaque (stem match)', () => {
    expect(
      sortedTodayHubNoteUrisFromRefs([
        {name: 'Today', uri: 'content://app/.../document/abc123'},
        {name: 'Note', uri: 'content://app/.../document/def456'},
      ]),
    ).toEqual(['content://app/.../document/abc123']);
  });
});

describe('vaultMarkdownRefIsTodayHubNote', () => {
  it('matches path ending with Today.md', () => {
    expect(
      vaultMarkdownRefIsTodayHubNote({name: 'Today', uri: '/vault/Daily/Today.md'}),
    ).toBe(true);
  });

  it('matches opaque URI when stem is Today', () => {
    expect(
      vaultMarkdownRefIsTodayHubNote({name: 'Today', uri: 'content://x/y/z'}),
    ).toBe(true);
  });

  it('rejects non-Today stem when URI is not Today.md', () => {
    expect(
      vaultMarkdownRefIsTodayHubNote({name: 'Journal', uri: 'content://app/doc/only'}),
    ).toBe(false);
  });
});

describe('todayHubFolderLabelFromUri', () => {
  it('uses parent folder name for Today.md', () => {
    expect(todayHubFolderLabelFromUri('/vault/Daily/Today.md')).toBe('Daily');
  });
});
