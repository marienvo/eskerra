import {describe, expect, it} from 'vitest';

import {
  editorOpenTabPillIconName,
  editorOpenTabPillLabel,
} from './editorOpenTabPillLabel';

describe('editorOpenTabPillLabel', () => {
  it('uses parent folder name for Today.md paths', () => {
    const notes: {name: string; uri: string}[] = [];
    expect(editorOpenTabPillLabel(notes, '/vault/Personal/Today.md')).toBe('Personal');
    expect(editorOpenTabPillLabel(notes, 'D:\\vault\\Work\\Today.md')).toBe('Work');
  });

  it('falls back to note list / filename rules for other notes', () => {
    const notes = [{name: 'Deep.md', uri: '/vault/Inbox/Deep.md'}];
    expect(editorOpenTabPillLabel(notes, '/vault/Inbox/Deep.md')).toBe('Deep');
  });
});

describe('editorOpenTabPillIconName', () => {
  it('uses today icon for Today.md uris', () => {
    expect(editorOpenTabPillIconName('/vault/Personal/Today.md')).toBe('today');
    expect(editorOpenTabPillIconName('/vault/Other.md')).toBe('description');
  });
});
