import {describe, expect, it} from 'vitest';

import {listInboxWikiLinkBacklinkReferrersForTarget} from './inboxWikiLinkBacklinkIndex';

const NOTES = [
  {name: 'A.md', uri: '/vault/Inbox/A.md'},
  {name: 'B.md', uri: '/vault/Inbox/B.md'},
  {name: 'C.md', uri: '/vault/Inbox/C.md'},
] as const;

describe('listInboxWikiLinkBacklinkReferrersForTarget', () => {
  it('lists referrers for resolved open links', () => {
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/B.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': 'ref [[B]] and [[C]]',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/A.md']);
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/C.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': 'ref [[B]] and [[C]]',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/A.md']);
  });

  it('uses active body override for the selected note', () => {
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/B.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': '',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: '/vault/Inbox/A.md',
        activeBody: 'live draft [[B]]',
      }),
    ).toEqual(['/vault/Inbox/A.md']);
  });

  it('excludes self links', () => {
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/A.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': 'self [[A]] and [[B]]',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual([]);
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/B.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': 'self [[A]] and [[B]]',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/A.md']);
  });

  it('lists referrers when link is ambiguous for multiple candidates', () => {
    const rows = [
      {name: 'Dup.md', uri: '/vault/Inbox/Dup.md'},
      {name: 'dup.md', uri: '/vault/Inbox/dup.md'},
      {name: 'Ref.md', uri: '/vault/Inbox/Ref.md'},
    ] as const;
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/Dup.md',
        notes: rows,
        contentByUri: {
          '/vault/Inbox/Dup.md': '',
          '/vault/Inbox/dup.md': '',
          '/vault/Inbox/Ref.md': '[[DUP]]',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/Ref.md']);
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/dup.md',
        notes: rows,
        contentByUri: {
          '/vault/Inbox/Dup.md': '',
          '/vault/Inbox/dup.md': '',
          '/vault/Inbox/Ref.md': '[[DUP]]',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/Ref.md']);
  });

  it('deduplicates repeated links from one source note', () => {
    expect(
      listInboxWikiLinkBacklinkReferrersForTarget({
        targetUri: '/vault/Inbox/B.md',
        notes: NOTES,
        contentByUri: {
          '/vault/Inbox/A.md': '[[B]] [[B]] [[B|label]]',
          '/vault/Inbox/B.md': '',
          '/vault/Inbox/C.md': '',
        },
        activeUri: null,
        activeBody: '',
      }),
    ).toEqual(['/vault/Inbox/A.md']);
  });
});
