import {describe, expect, it} from 'vitest';

import {editorTabPillDisplayName} from './editorTabPillDisplayName';

describe('editorTabPillDisplayName', () => {
  it('strips trailing .md (case-insensitive check, preserves original casing prefix)', () => {
    expect(editorTabPillDisplayName('Note.md')).toBe('Note');
    expect(editorTabPillDisplayName('draft.MD')).toBe('draft');
  });

  it('leaves names without .md unchanged', () => {
    expect(editorTabPillDisplayName('README')).toBe('README');
    expect(editorTabPillDisplayName('foo.md.backup')).toBe('foo.md.backup');
  });

  it('does not produce an empty label when the file name is only .md', () => {
    expect(editorTabPillDisplayName('.md')).toBe('.md');
  });
});
