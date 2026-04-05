import {describe, expect, it} from 'vitest';

import {buildInboxWikiLinkResolveLookup, type InboxWikiLinkNoteRef} from './wikiLinkInbox';
import {planInboxWikiLinkRenameInMarkdown} from './wikiLinkRename';

describe('planInboxWikiLinkRenameInMarkdown', () => {
  const oldNote = {name: 'Old Name.md', uri: '/vault/Inbox/Old Name.md'} as const;
  const other = {name: 'Other.md', uri: '/vault/Inbox/Other.md'} as const;

  function plan(markdown: string, notes: ReadonlyArray<InboxWikiLinkNoteRef>) {
    return planInboxWikiLinkRenameInMarkdown({
      markdown,
      lookup: buildInboxWikiLinkResolveLookup(notes),
      oldTargetUri: oldNote.uri,
      renamedStem: 'New Name',
    });
  }

  it('rewrites plain target links that resolve to the renamed note', () => {
    const result = plan('A [[Old Name]] B [[Other]]', [oldNote, other]);
    expect(result).toEqual({
      changed: true,
      markdown: 'A [[New Name]] B [[Other]]',
      updatedLinkCount: 1,
      skippedAmbiguousLinkCount: 0,
    });
  });

  it('rewrites target while preserving display text', () => {
    const result = plan('[[old name|Shown Label]]', [oldNote]);
    expect(result).toEqual({
      changed: true,
      markdown: '[[New Name|Shown Label]]',
      updatedLinkCount: 1,
      skippedAmbiguousLinkCount: 0,
    });
  });

  it('preserves explicit Inbox prefix on rewritten links', () => {
    const result = plan('[[Inbox/old name|Shown]]', [oldNote]);
    expect(result).toEqual({
      changed: true,
      markdown: '[[Inbox/New Name|Shown]]',
      updatedLinkCount: 1,
      skippedAmbiguousLinkCount: 0,
    });
  });

  it('rewrites self-links in the renamed note body', () => {
    const result = plan('self [[Old Name]]', [oldNote]);
    expect(result).toEqual({
      changed: true,
      markdown: 'self [[New Name]]',
      updatedLinkCount: 1,
      skippedAmbiguousLinkCount: 0,
    });
  });

  it('skips ambiguous links and reports skipped count', () => {
    const duplicateA = {name: 'dup.md', uri: '/vault/Inbox/dup.md'};
    const duplicateB = {name: 'Dup.md', uri: '/vault/Inbox/Dup.md'};
    const result = planInboxWikiLinkRenameInMarkdown({
      markdown: '[[DUP]]',
      lookup: buildInboxWikiLinkResolveLookup([duplicateA, duplicateB]),
      oldTargetUri: duplicateA.uri,
      renamedStem: 'Renamed',
    });
    expect(result).toEqual({
      changed: false,
      markdown: '[[DUP]]',
      updatedLinkCount: 0,
      skippedAmbiguousLinkCount: 1,
    });
  });

  it('leaves create and unsupported links unchanged', () => {
    const result = plan('[[Missing]] [[foo/bar]]', [oldNote]);
    expect(result).toEqual({
      changed: false,
      markdown: '[[Missing]] [[foo/bar]]',
      updatedLinkCount: 0,
      skippedAmbiguousLinkCount: 0,
    });
  });
});
