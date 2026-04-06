import {describe, expect, it} from 'vitest';

import {
  buildInboxWikiLinkResolveLookup,
  resolveInboxWikiLinkTarget,
  resolveInboxWikiLinkTargetWithLookup,
  wikiLinkInnerBrowserOpenableHref,
} from './wikiLinkInbox';

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

  it('opens exact stem match without canonical rewrite metadata', () => {
    const rows = [{name: 'Alpha Note.md', uri: '/vault/Inbox/Alpha Note.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'Alpha Note')).toEqual({
      kind: 'open',
      note: rows[0],
    });
  });

  it('opens unique case-insensitive stem match and returns canonical inner', () => {
    const rows = [{name: 'Alpha Note.md', uri: '/vault/Inbox/Alpha Note.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'alpha note')).toEqual({
      kind: 'open',
      note: rows[0],
      canonicalInner: 'Alpha Note',
    });
  });

  it('preserves display text and explicit Inbox/ prefix in canonical inner', () => {
    const rows = [{name: 'Alpha Note.md', uri: '/vault/Inbox/Alpha Note.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'inbox/alpha note|Label')).toEqual({
      kind: 'open',
      note: rows[0],
      canonicalInner: 'Inbox/Alpha Note|Label',
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

  it('opens when target matches an existing stem after filename sanitization', () => {
    const rows = [{name: 'Test.md', uri: '/vault/Inbox/Test.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'test?')).toEqual({
      kind: 'open',
      note: rows[0],
      canonicalInner: 'Test',
    });
  });

  it('preserves display text on sanitized-stem canonical open', () => {
    const rows = [{name: 'Test.md', uri: '/vault/Inbox/Test.md'}];
    expect(resolveInboxWikiLinkTarget(rows, 'test?|Label')).toEqual({
      kind: 'open',
      note: rows[0],
      canonicalInner: 'Test|Label',
    });
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

  it('returns ambiguous when multiple stems match case-insensitively', () => {
    const rows = [
      {name: 'Alpha.md', uri: '/vault/Inbox/Alpha.md'},
      {name: 'alpha.md', uri: '/vault/Inbox/alpha.md'},
    ];
    expect(resolveInboxWikiLinkTarget(rows, 'ALPHA')).toEqual({
      kind: 'ambiguous',
      notes: rows,
      targetStem: 'ALPHA',
      title: 'ALPHA',
    });
  });

  it('returns ambiguous when multiple stems match after sanitization', () => {
    const rows = [
      {name: 'a?.md', uri: '/vault/Inbox/a?.md'},
      {name: 'a*.md', uri: '/vault/Inbox/a*.md'},
    ];
    expect(resolveInboxWikiLinkTarget(rows, 'a:')).toEqual({
      kind: 'ambiguous',
      notes: rows,
      targetStem: 'a:',
      title: 'a:',
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

describe('wikiLinkInnerBrowserOpenableHref', () => {
  it('returns https target and ignores display text', () => {
    expect(wikiLinkInnerBrowserOpenableHref('https://example.com/path|Site')).toBe(
      'https://example.com/path',
    );
  });

  it('returns bare https inner', () => {
    expect(wikiLinkInnerBrowserOpenableHref('https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('returns mailto href', () => {
    expect(wikiLinkInnerBrowserOpenableHref('mailto:a@example.com|Email')).toBe(
      'mailto:a@example.com',
    );
  });

  it('returns null for vault-style targets', () => {
    expect(wikiLinkInnerBrowserOpenableHref('alpha-note')).toBeNull();
    expect(wikiLinkInnerBrowserOpenableHref('Inbox/beta')).toBeNull();
  });

  it('returns null for disallowed schemes', () => {
    expect(wikiLinkInnerBrowserOpenableHref('javascript:alert(1)')).toBeNull();
  });
});

describe('resolveInboxWikiLinkTargetWithLookup', () => {
  it('matches resolveInboxWikiLinkTarget for the same fixtures', () => {
    const alphaNote = [{name: 'Alpha Note.md', uri: '/vault/Inbox/Alpha Note.md'}];
    const dupRows = [
      {name: 'dup.md', uri: '/vault/Inbox/dup.md'},
      {name: 'dup.md', uri: '/vault/Inbox/archive/dup.md'},
    ];
    const caseRows = [
      {name: 'Alpha.md', uri: '/vault/Inbox/Alpha.md'},
      {name: 'alpha.md', uri: '/vault/Inbox/alpha.md'},
    ];
    const sanitizedRows = [
      {name: 'a?.md', uri: '/vault/Inbox/a?.md'},
      {name: 'a*.md', uri: '/vault/Inbox/a*.md'},
    ];
    const testMd = [{name: 'Test.md', uri: '/vault/Inbox/Test.md'}];

    const cases: Array<{
      notes: ReadonlyArray<{name: string; uri: string}>;
      inner: string;
    }> = [
      {notes: NOTES, inner: 'alpha-note'},
      {notes: alphaNote, inner: 'Alpha Note'},
      {notes: alphaNote, inner: 'alpha note'},
      {notes: alphaNote, inner: 'inbox/alpha note|Label'},
      {notes: NOTES, inner: 'InBoX/beta'},
      {notes: NOTES, inner: 'New Page'},
      {notes: testMd, inner: 'test?'},
      {notes: testMd, inner: 'test?|Label'},
      {notes: NOTES, inner: 'new-page|My Display'},
      {notes: dupRows, inner: 'dup'},
      {notes: caseRows, inner: 'ALPHA'},
      {notes: sanitizedRows, inner: 'a:'},
      {notes: NOTES, inner: '   '},
      {notes: NOTES, inner: 'foo/bar'},
    ];

    for (const {notes, inner} of cases) {
      const lookup = buildInboxWikiLinkResolveLookup(notes);
      expect(resolveInboxWikiLinkTargetWithLookup(lookup, inner)).toEqual(
        resolveInboxWikiLinkTarget(notes, inner),
      );
    }
  });
});
