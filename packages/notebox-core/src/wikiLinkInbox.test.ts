import {describe, expect, it} from 'vitest';

import {resolveInboxWikiLinkTarget} from './wikiLinkInbox';

const NOTES = [
  {name: 'alpha-note.md', uri: '/vault/Inbox/alpha-note.md'},
  {name: 'beta.md', uri: '/vault/Inbox/beta.md'},
] as const;

describe('resolveInboxWikiLinkTarget', () => {
  it('opens a single exact stem match', () => {
    const got = resolveInboxWikiLinkTarget(NOTES, 'alpha-note');
    expect(got).toEqual({
      kind: 'open',
      note: {name: 'alpha-note.md', uri: '/vault/Inbox/alpha-note.md'},
    });
  });

  it('matches case-sensitively against the exact stem', () => {
    const rows = [{name: 'Alpha Note.md', uri: '/vault/Inbox/Alpha Note.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'Alpha Note')).toEqual({
      kind: 'open',
      note: rows[0],
    });
    expect(resolveInboxWikiLinkTarget(rows, 'alpha note')).toEqual({
      kind: 'create',
      title: 'alpha note',
    });
  });

  it('supports case-insensitive Inbox/ prefix stripping', () => {
    const got = resolveInboxWikiLinkTarget(NOTES, 'InBoX/beta');
    expect(got).toEqual({
      kind: 'open',
      note: {name: 'beta.md', uri: '/vault/Inbox/beta.md'},
    });
  });

  it('returns create when no match exists', () => {
    const got = resolveInboxWikiLinkTarget(NOTES, 'New Page');
    expect(got).toEqual({kind: 'create', title: 'New Page'});
  });

  it('uses display text as title for create', () => {
    const got = resolveInboxWikiLinkTarget(NOTES, 'new-page|My Display');
    expect(got).toEqual({kind: 'create', title: 'My Display'});
  });

  it('returns ambiguous when multiple notes match same stem', () => {
    const rows = [
      {name: 'dup.md', uri: '/vault/Inbox/dup.md'},
      {name: 'dup.md', uri: '/vault/Inbox/archive/dup.md'},
    ];
    const got = resolveInboxWikiLinkTarget(rows, 'dup');
    expect(got).toEqual({
      kind: 'ambiguous',
      notes: rows,
      targetStem: 'dup',
      title: 'dup',
    });
  });

  it('returns unsupported for empty or path targets', () => {
    expect(resolveInboxWikiLinkTarget(NOTES, '   ')).toEqual({
      kind: 'unsupported',
      reason: 'empty_target',
    });
    expect(resolveInboxWikiLinkTarget(NOTES, 'foo/bar')).toEqual({
      kind: 'unsupported',
      reason: 'path_not_supported',
    });
  });
});
