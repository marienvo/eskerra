import {describe, expect, it} from 'vitest';

import {
  isEditorClosedTabReopenable,
  pushClosedTabsFromCloseAll,
  pushClosedTabsFromCloseOther,
} from './editorClosedTabStack';

describe('isEditorClosedTabReopenable', () => {
  it('returns true for path under vault with .md suffix', () => {
    const set = new Set<string>();
    expect(
      isEditorClosedTabReopenable('/vault/Inbox/x.md', '/vault', set),
    ).toBe(true);
  });

  it('returns true when uri is in note set', () => {
    const set = new Set(['/vault/a.md']);
    expect(isEditorClosedTabReopenable('/vault/a.md', '/vault', set)).toBe(
      true,
    );
  });

  it('returns false outside vault', () => {
    expect(
      isEditorClosedTabReopenable('/other/x.md', '/vault', new Set()),
    ).toBe(false);
  });
});

describe('pushClosedTabsFromCloseOther', () => {
  it('pushes removed tabs right-to-left (LIFO reopen = rightmost first)', () => {
    const s: string[] = [];
    pushClosedTabsFromCloseOther(s, ['/a.md', '/b.md', '/c.md'], '/b.md');
    expect(s).toEqual(['/c.md', '/a.md']);
  });
});

describe('pushClosedTabsFromCloseAll', () => {
  it('pushes selected last so it is reopened first', () => {
    const s: string[] = [];
    pushClosedTabsFromCloseAll(s, ['/a.md', '/b.md', '/c.md'], '/b.md');
    expect(s).toEqual(['/c.md', '/a.md', '/b.md']);
  });

  it('pushes right-to-left when no selection in list', () => {
    const s: string[] = [];
    pushClosedTabsFromCloseAll(s, ['/a.md', '/b.md'], null);
    expect(s).toEqual(['/b.md', '/a.md']);
  });
});
