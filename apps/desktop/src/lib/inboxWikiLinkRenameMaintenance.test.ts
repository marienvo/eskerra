import {describe, expect, it, vi} from 'vitest';

import {
  applyInboxWikiLinkRenameMaintenance,
  planInboxWikiLinkRenameMaintenance,
} from './inboxWikiLinkRenameMaintenance';

import type {VaultFilesystem} from '@notebox/core';

describe('planInboxWikiLinkRenameMaintenance', () => {
  const notes = [
    {name: 'Old.md', uri: '/vault/Inbox/Old.md'},
    {name: 'Ref.md', uri: '/vault/Inbox/Ref.md'},
    {name: 'Other.md', uri: '/vault/Inbox/Other.md'},
  ] as const;

  it('plans updates by scanning all notes and uses active body override', () => {
    const result = planInboxWikiLinkRenameMaintenance({
      oldTargetUri: '/vault/Inbox/Old.md',
      renamedStem: 'Renamed',
      notes,
      contentByUri: {
        '/vault/Inbox/Old.md': 'self [[Old]]',
        '/vault/Inbox/Ref.md': '',
        '/vault/Inbox/Other.md': '[[Other]]',
      },
      activeUri: '/vault/Inbox/Ref.md',
      activeBody: 'draft [[Old|Label]]',
    });

    expect(result.scannedFileCount).toBe(3);
    expect(result.touchedFileCount).toBe(2);
    expect(result.updatedLinkCount).toBe(2);
    expect(result.skippedAmbiguousLinkCount).toBe(0);
    expect(result.touchedBytes).toBeGreaterThan(0);
    expect(result.updates).toEqual([
      {
        uri: '/vault/Inbox/Old.md',
        markdown: 'self [[Renamed]]',
        updatedLinkCount: 1,
      },
      {
        uri: '/vault/Inbox/Ref.md',
        markdown: 'draft [[Renamed|Label]]',
        updatedLinkCount: 1,
      },
    ]);
  });

  it('tracks ambiguous skips without rewriting ambiguous links', () => {
    const duplicateNotes = [
      {name: 'Dup.md', uri: '/vault/Inbox/Dup.md'},
      {name: 'dup.md', uri: '/vault/Inbox/dup.md'},
      {name: 'Ref.md', uri: '/vault/Inbox/Ref.md'},
    ] as const;
    const result = planInboxWikiLinkRenameMaintenance({
      oldTargetUri: '/vault/Inbox/Dup.md',
      renamedStem: 'Renamed',
      notes: duplicateNotes,
      contentByUri: {
        '/vault/Inbox/Dup.md': '',
        '/vault/Inbox/dup.md': '',
        '/vault/Inbox/Ref.md': '[[DUP]]',
      },
      activeUri: null,
      activeBody: '',
    });
    expect(result).toMatchObject({
      touchedFileCount: 0,
      updatedLinkCount: 0,
      skippedAmbiguousLinkCount: 1,
    });
  });
});

describe('applyInboxWikiLinkRenameMaintenance', () => {
  function createFs(overrides?: Partial<VaultFilesystem>): VaultFilesystem {
    return {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockResolvedValue(undefined),
      listFiles: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  it('rewrites oldUri updates to newUri during apply', async () => {
    const fs = createFs();
    const result = await applyInboxWikiLinkRenameMaintenance({
      fs,
      oldUri: '/vault/Inbox/Old.md',
      newUri: '/vault/Inbox/New.md',
      updates: [
        {uri: '/vault/Inbox/Old.md', markdown: '[[New]]', updatedLinkCount: 1},
        {uri: '/vault/Inbox/Ref.md', markdown: '[[New]]', updatedLinkCount: 1},
      ],
    });

    expect(fs.writeFile).toHaveBeenCalledWith('/vault/Inbox/New.md', '[[New]]', {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
    expect(fs.writeFile).toHaveBeenCalledWith('/vault/Inbox/Ref.md', '[[New]]', {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
    expect(result).toEqual({
      succeededUris: ['/vault/Inbox/New.md', '/vault/Inbox/Ref.md'],
      failed: [],
    });
  });

  it('continues after write failures and reports failed uris', async () => {
    const fs = createFs({
      writeFile: vi.fn().mockImplementation(async (uri: string) => {
        if (uri.endsWith('Ref.md')) {
          throw new Error('disk full');
        }
      }),
    });
    const result = await applyInboxWikiLinkRenameMaintenance({
      fs,
      oldUri: '/vault/Inbox/Old.md',
      newUri: '/vault/Inbox/New.md',
      updates: [
        {uri: '/vault/Inbox/Old.md', markdown: '[[New]]', updatedLinkCount: 1},
        {uri: '/vault/Inbox/Ref.md', markdown: '[[New]]', updatedLinkCount: 1},
      ],
    });
    expect(result).toEqual({
      succeededUris: ['/vault/Inbox/New.md'],
      failed: [{uri: '/vault/Inbox/Ref.md', reason: 'disk full'}],
    });
  });
});
