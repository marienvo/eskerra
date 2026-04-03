import {describe, expect, it} from 'vitest';

import {buildInboxWikiLinkBacklinkIndex} from './inboxWikiLinkBacklinkIndex';

const NOTES = [
  {name: 'A.md', uri: '/vault/Inbox/A.md'},
  {name: 'B.md', uri: '/vault/Inbox/B.md'},
  {name: 'C.md', uri: '/vault/Inbox/C.md'},
] as const;

describe('buildInboxWikiLinkBacklinkIndex', () => {
  it('builds backlinks for resolved open links', () => {
    const got = buildInboxWikiLinkBacklinkIndex({
      notes: NOTES,
      contentByUri: {
        '/vault/Inbox/A.md': 'ref [[B]] and [[C]]',
        '/vault/Inbox/B.md': '',
        '/vault/Inbox/C.md': '',
      },
      activeUri: null,
      activeBody: '',
    });
    expect(got.get('/vault/Inbox/B.md')).toEqual(['/vault/Inbox/A.md']);
    expect(got.get('/vault/Inbox/C.md')).toEqual(['/vault/Inbox/A.md']);
  });

  it('uses active body override for the selected note', () => {
    const got = buildInboxWikiLinkBacklinkIndex({
      notes: NOTES,
      contentByUri: {
        '/vault/Inbox/A.md': '',
        '/vault/Inbox/B.md': '',
        '/vault/Inbox/C.md': '',
      },
      activeUri: '/vault/Inbox/A.md',
      activeBody: 'live draft [[B]]',
    });
    expect(got.get('/vault/Inbox/B.md')).toEqual(['/vault/Inbox/A.md']);
  });

  it('excludes self links', () => {
    const got = buildInboxWikiLinkBacklinkIndex({
      notes: NOTES,
      contentByUri: {
        '/vault/Inbox/A.md': 'self [[A]] and [[B]]',
        '/vault/Inbox/B.md': '',
        '/vault/Inbox/C.md': '',
      },
      activeUri: null,
      activeBody: '',
    });
    expect(got.get('/vault/Inbox/A.md')).toBeUndefined();
    expect(got.get('/vault/Inbox/B.md')).toEqual(['/vault/Inbox/A.md']);
  });

  it('adds backlinks for every ambiguous target candidate', () => {
    const rows = [
      {name: 'Dup.md', uri: '/vault/Inbox/Dup.md'},
      {name: 'dup.md', uri: '/vault/Inbox/dup.md'},
      {name: 'Ref.md', uri: '/vault/Inbox/Ref.md'},
    ] as const;
    const got = buildInboxWikiLinkBacklinkIndex({
      notes: rows,
      contentByUri: {
        '/vault/Inbox/Dup.md': '',
        '/vault/Inbox/dup.md': '',
        '/vault/Inbox/Ref.md': '[[DUP]]',
      },
      activeUri: null,
      activeBody: '',
    });
    expect(got.get('/vault/Inbox/Dup.md')).toEqual(['/vault/Inbox/Ref.md']);
    expect(got.get('/vault/Inbox/dup.md')).toEqual(['/vault/Inbox/Ref.md']);
  });

  it('deduplicates repeated links from one source note', () => {
    const got = buildInboxWikiLinkBacklinkIndex({
      notes: NOTES,
      contentByUri: {
        '/vault/Inbox/A.md': '[[B]] [[B]] [[B|label]]',
        '/vault/Inbox/B.md': '',
        '/vault/Inbox/C.md': '',
      },
      activeUri: null,
      activeBody: '',
    });
    expect(got.get('/vault/Inbox/B.md')).toEqual(['/vault/Inbox/A.md']);
  });
});
