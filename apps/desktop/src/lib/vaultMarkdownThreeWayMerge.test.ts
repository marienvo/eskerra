import {describe, expect, it} from 'vitest';

import {tryMergeThreeWayVaultMarkdown} from './vaultMarkdownThreeWayMerge';

describe('tryMergeThreeWayVaultMarkdown', () => {
  it('returns disk when local matches base', () => {
    expect(tryMergeThreeWayVaultMarkdown('a\nb', 'a\nb', 'a\nc')).toEqual({
      ok: true,
      merged: 'a\nc',
    });
  });

  it('returns local when disk matches base', () => {
    expect(tryMergeThreeWayVaultMarkdown('a\nb', 'a\nx', 'a\nb')).toEqual({
      ok: true,
      merged: 'a\nx',
    });
  });

  it('returns merged text when local and disk match', () => {
    expect(tryMergeThreeWayVaultMarkdown('a', 'b', 'b')).toEqual({ok: true, merged: 'b'});
  });

  it('merges non-overlapping single-line edits', () => {
    const base = 'line0\nline1\nline2';
    const local = 'line0\nlocalMid\nline2';
    const disk = 'diskTop\nline1\nline2';
    const r = tryMergeThreeWayVaultMarkdown(base, local, disk);
    expect(r).toEqual({ok: true, merged: 'diskTop\nlocalMid\nline2'});
  });

  it('merges append-only local with prepend-only disk', () => {
    const base = 'm';
    const local = 'm\nlocalTail';
    const disk = 'diskHead\nm';
    const r = tryMergeThreeWayVaultMarkdown(base, local, disk);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged).toBe('diskHead\nm\nlocalTail');
    }
  });

  it('fails when the same base line is edited both sides', () => {
    const base = 'a\nb\nc';
    expect(
      tryMergeThreeWayVaultMarkdown(base, 'a\nx\nc', 'a\ny\nc'),
    ).toEqual({ok: false});
  });

  it('normalizes CRLF when taking disk as canonical', () => {
    const r = tryMergeThreeWayVaultMarkdown('a', 'a', 'b\rc\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.merged).toBe('b\nc\n');
    }
  });
});
