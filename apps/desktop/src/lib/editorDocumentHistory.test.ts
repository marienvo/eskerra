import {describe, expect, it} from 'vitest';

import {
  emptyEditorDocumentHistory,
  normalizeEditorDocUri,
  pushEditorHistoryEntry,
  remapEditorHistoryPrefix,
  remapVaultUriPrefix,
  removeEditorHistoryUris,
  vaultUriDeletedByTreeChange,
} from './editorDocumentHistory';

describe('normalizeEditorDocUri', () => {
  it('trims and normalizes slashes', () => {
    expect(normalizeEditorDocUri('  a\\b\\c  ')).toBe('a/b/c');
  });
});

describe('pushEditorHistoryEntry', () => {
  it('starts stack with first uri', () => {
    const s = emptyEditorDocumentHistory();
    expect(pushEditorHistoryEntry(s, '/vault/a.md')).toEqual({
      entries: ['/vault/a.md'],
      index: 0,
    });
  });

  it('does not duplicate current entry', () => {
    let s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/a.md');
    s = pushEditorHistoryEntry(s, '/b.md');
    const again = pushEditorHistoryEntry(s, '/b.md');
    expect(again).toEqual({entries: ['/a.md', '/b.md'], index: 1});
  });

  it('truncates forward branch when pushing after going back', () => {
    let s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/a.md');
    s = pushEditorHistoryEntry(s, '/b.md');
    s = pushEditorHistoryEntry(s, '/c.md');
    expect(s).toEqual({entries: ['/a.md', '/b.md', '/c.md'], index: 2});
    s = {...s, index: 0};
    const branched = pushEditorHistoryEntry(s, '/x.md');
    expect(branched).toEqual({entries: ['/a.md', '/x.md'], index: 1});
  });
});

describe('remapEditorHistoryPrefix', () => {
  it('rewrites entries under renamed folder', () => {
    let s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/v/Old/a.md');
    s = pushEditorHistoryEntry(s, '/v/Old/b.md');
    const mapped = remapEditorHistoryPrefix(s, '/v/Old', '/v/New');
    expect(mapped.entries).toEqual(['/v/New/a.md', '/v/New/b.md']);
    expect(mapped.index).toBe(1);
  });
});

describe('remapVaultUriPrefix', () => {
  it('maps exact directory match', () => {
    expect(remapVaultUriPrefix('/v/A', '/v/A', '/v/B')).toBe('/v/B');
  });

  it('maps nested paths', () => {
    expect(remapVaultUriPrefix('/v/A/x.md', '/v/A', '/v/B')).toBe('/v/B/x.md');
  });

  it('returns null when no match', () => {
    expect(remapVaultUriPrefix('/other/x.md', '/v/A', '/v/B')).toBe(null);
  });
});

describe('removeEditorHistoryUris', () => {
  it('drops removed uri and moves index to previous neighbor', () => {
    let s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/a.md');
    s = pushEditorHistoryEntry(s, '/b.md');
    s = pushEditorHistoryEntry(s, '/c.md');
    const next = removeEditorHistoryUris(s, u => u === '/b.md');
    expect(next.entries).toEqual(['/a.md', '/c.md']);
    expect(next.index).toBe(1);
  });

  it('goes to forward neighbor when only earlier entries remain', () => {
    let s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/a.md');
    s = pushEditorHistoryEntry(s, '/b.md');
    s = {...s, index: 0};
    const next = removeEditorHistoryUris(s, u => u === '/a.md');
    expect(next.entries).toEqual(['/b.md']);
    expect(next.index).toBe(0);
  });

  it('clears stack when all removed', () => {
    const s = pushEditorHistoryEntry(emptyEditorDocumentHistory(), '/a.md');
    const next = removeEditorHistoryUris(s, () => true);
    expect(next).toEqual({entries: [], index: -1});
  });
});

describe('vaultUriDeletedByTreeChange', () => {
  it('matches file set', () => {
    expect(
      vaultUriDeletedByTreeChange('/x/a.md', new Set(['/x/a.md']), []),
    ).toBe(true);
  });

  it('matches folder prefix', () => {
    expect(
      vaultUriDeletedByTreeChange('/x/sub/n.md', new Set(), ['/x/sub']),
    ).toBe(true);
  });

  it('does not match sibling folder', () => {
    expect(
      vaultUriDeletedByTreeChange('/x/sub2/n.md', new Set(), ['/x/sub']),
    ).toBe(false);
  });
});
