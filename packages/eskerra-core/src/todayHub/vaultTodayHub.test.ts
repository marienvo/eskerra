import {describe, expect, it} from 'vitest';

import {
  collectTodayHubRowStemsFromVaultMarkdownRefs,
  parseTodayHubRowStemToLocalCalendarDate,
  sortedTodayHubNoteUrisFromRefs,
  todayHubFolderLabelFromTodayNoteUri,
  todayHubFolderLabelFromUri,
  todayHubFolderLabelFromVaultMarkdownRef,
  todayHubRowUriFromTodayNoteUri,
  vaultMarkdownRefIsTodayHubNote,
  vaultTodayHubMarkdownRefUriMatchesExpectedRowUri,
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

describe('todayHubFolderLabelFromTodayNoteUri', () => {
  it('matches file paths like todayHubFolderLabelFromUri', () => {
    expect(todayHubFolderLabelFromTodayNoteUri('/vault/Daily/Today.md')).toBe('Daily');
  });

  it('reads parent folder from SAF document id', () => {
    const hub =
      'content://com.android.externalstorage.documents/document/primary%3Avault%2FDaily%2FToday.md';
    expect(todayHubFolderLabelFromTodayNoteUri(hub)).toBe('Daily');
  });
});

describe('todayHubFolderLabelFromVaultMarkdownRef', () => {
  it('delegates to todayHubFolderLabelFromTodayNoteUri', () => {
    const uri =
      'content://x/document/primary%3Avault%2FDaily%2FToday.md';
    expect(todayHubFolderLabelFromVaultMarkdownRef({name: 'Today', uri})).toBe('Daily');
  });
});

describe('parseTodayHubRowStemToLocalCalendarDate', () => {
  it('parses valid stems', () => {
    const d = parseTodayHubRowStemToLocalCalendarDate('2026-04-13');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getDate()).toBe(13);
  });

  it('rejects invalid calendar dates', () => {
    expect(parseTodayHubRowStemToLocalCalendarDate('2026-02-31')).toBeNull();
    expect(parseTodayHubRowStemToLocalCalendarDate('not-a-date')).toBeNull();
  });
});

describe('collectTodayHubRowStemsFromVaultMarkdownRefs', () => {
  const hub = '/vault/Daily/Today.md';

  it('collects date stems beside Today that match expected row URIs', () => {
    const stems = collectTodayHubRowStemsFromVaultMarkdownRefs(hub, [
      {name: 'Today', uri: hub},
      {name: '2026-04-13', uri: '/vault/Daily/2026-04-13.md'},
      {name: '2026-03-30', uri: '/vault/Daily/2026-03-30.md'},
      {name: 'Note', uri: '/vault/Other/2026-04-13.md'},
    ]);
    expect([...stems].sort()).toEqual(['2026-03-30', '2026-04-13']);
  });

  it('matches SAF-encoded row URIs', () => {
    const rowWeek = new Date(2026, 3, 13);
    const rowUri = todayHubRowUriFromTodayNoteUri(hub, rowWeek);
    const stems = collectTodayHubRowStemsFromVaultMarkdownRefs(hub, [
      {name: 'Today', uri: hub},
      {name: '2026-04-13', uri: rowUri},
    ]);
    expect(stems.has('2026-04-13')).toBe(true);
  });
});

describe('vaultTodayHubMarkdownRefUriMatchesExpectedRowUri', () => {
  it('returns true for matching file paths', () => {
    const hub = '/vault/Daily/Today.md';
    const week = new Date(2026, 3, 13);
    expect(
      vaultTodayHubMarkdownRefUriMatchesExpectedRowUri(
        hub,
        '/vault/Daily/2026-04-13.md',
        week,
      ),
    ).toBe(true);
  });
});

describe('todayHubRowUriFromTodayNoteUri', () => {
  const week = new Date(2026, 3, 13);

  it('joins beside Today.md on file paths', () => {
    expect(todayHubRowUriFromTodayNoteUri('/vault/Daily/Today.md', week)).toBe(
      '/vault/Daily/2026-04-13.md',
    );
  });

  it('joins beside Today.md on Windows paths', () => {
    expect(todayHubRowUriFromTodayNoteUri('C:\\vault\\Daily\\Today.md', week)).toBe(
      'C:/vault/Daily/2026-04-13.md',
    );
  });

  it('replaces Today.md inside SAF document id', () => {
    const hub =
      'content://com.android.externalstorage.documents/document/primary%3Avault%2FDaily%2FToday.md';
    expect(todayHubRowUriFromTodayNoteUri(hub, week)).toBe(
      'content://com.android.externalstorage.documents/document/primary%3Avault%2FDaily%2F2026-04-13.md',
    );
  });
});
