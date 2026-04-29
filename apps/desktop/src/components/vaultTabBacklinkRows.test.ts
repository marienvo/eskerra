import {describe, expect, it} from 'vitest';

import {buildVaultTabBacklinkRows} from './vaultTabBacklinkRows';

const baseArgs = {
  composingNewEntry: false,
  selectedUri: null,
  editorBody: '',
  inboxContentByUri: {},
};

describe('buildVaultTabBacklinkRows', () => {
  it('falls back to the note title from the referenced file name', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['/vault/Notes/source.md'],
        vaultMarkdownRefs: [
          {name: 'Source Note.md', uri: '/vault/Notes/source.md'},
        ],
      }),
    ).toEqual([
      {uri: '/vault/Notes/source.md', fileName: 'Source Note.md', title: 'Source Note'},
    ]);
  });

  it('uses the URI basename when the markdown ref is missing', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['/vault/Notes/missing-ref.md'],
        vaultMarkdownRefs: [],
      }),
    ).toEqual([
      {
        uri: '/vault/Notes/missing-ref.md',
        fileName: 'missing-ref.md',
        title: 'missing ref',
      },
    ]);
  });

  it('preserves backlink URI ordering', () => {
    const rows = buildVaultTabBacklinkRows({
      ...baseArgs,
      backlinkUris: ['/vault/c.md', '/vault/a.md', '/vault/b.md'],
      vaultMarkdownRefs: [
        {name: 'A.md', uri: '/vault/a.md'},
        {name: 'B.md', uri: '/vault/b.md'},
        {name: 'C.md', uri: '/vault/c.md'},
      ],
    });

    expect(rows.map(row => row.uri)).toEqual([
      '/vault/c.md',
      '/vault/a.md',
      '/vault/b.md',
    ]);
  });

  it('uses cached markdown H1 when available', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['/vault/Notes/source.md'],
        vaultMarkdownRefs: [
          {name: 'Source Note.md', uri: '/vault/Notes/source.md'},
        ],
        inboxContentByUri: {
          '/vault/Notes/source.md': '# Cached Title\n\nBody',
        },
      }),
    ).toEqual([
      {uri: '/vault/Notes/source.md', fileName: 'Source Note.md', title: 'Cached Title'},
    ]);
  });

  it('uses the current editor body for the selected non-composing backlink URI', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['/vault/Notes/source.md'],
        vaultMarkdownRefs: [
          {name: 'Source Note.md', uri: '/vault/Notes/source.md'},
        ],
        selectedUri: '/vault/Notes/source.md',
        editorBody: '# Live Editor Title\n\nUnsaved body',
        inboxContentByUri: {
          '/vault/Notes/source.md': '# Cached Title\n\nBody',
        },
      }),
    ).toEqual([
      {
        uri: '/vault/Notes/source.md',
        fileName: 'Source Note.md',
        title: 'Live Editor Title',
      },
    ]);
  });

  it('uses cached markdown instead of the editor body while composing', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['/vault/Notes/source.md'],
        vaultMarkdownRefs: [
          {name: 'Source Note.md', uri: '/vault/Notes/source.md'},
        ],
        composingNewEntry: true,
        selectedUri: '/vault/Notes/source.md',
        editorBody: '# Live Editor Title\n\nUnsaved body',
        inboxContentByUri: {
          '/vault/Notes/source.md': '# Cached Title\n\nBody',
        },
      }),
    ).toEqual([
      {uri: '/vault/Notes/source.md', fileName: 'Source Note.md', title: 'Cached Title'},
    ]);
  });

  it('matches refs with normalized separators but keeps original row URI', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: ['C:\\vault\\Notes\\source.md'],
        vaultMarkdownRefs: [
          {name: 'Source Note.md', uri: 'C:/vault/Notes/source.md'},
        ],
      }),
    ).toEqual([
      {
        uri: 'C:\\vault\\Notes\\source.md',
        fileName: 'Source Note.md',
        title: 'Source Note',
      },
    ]);
  });

  it('skips rows when neither ref name nor URI basename provides a file name', () => {
    expect(
      buildVaultTabBacklinkRows({
        ...baseArgs,
        backlinkUris: [''],
        vaultMarkdownRefs: [],
      }),
    ).toEqual([]);
  });
});
