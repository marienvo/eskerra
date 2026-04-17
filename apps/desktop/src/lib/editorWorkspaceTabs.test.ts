import {describe, expect, it} from 'vitest';

import {pushEditorHistoryEntry} from './editorDocumentHistory';
import {
  collectDistinctUrisFromTabs,
  createEditorWorkspaceTab,
  ensureActiveTabId,
  findTabIdWithCurrentUri,
  insertTabAfterActive,
  insertTabAtIndex,
  migrateOpenTabUrisToWorkspaceTabs,
  pickNeighborTabIdAfterRemovingTab,
  pushNavigateOnTab,
  removeUriFromAllTabs,
  reorderEditorWorkspaceTabsInArray,
  tabCurrentUri,
  tabsFromStored,
  tabsToStored,
} from './editorWorkspaceTabs';

describe('editorWorkspaceTabs', () => {
  it('tabCurrentUri reads active history slot', () => {
    const t = createEditorWorkspaceTab('/v/a.md');
    expect(tabCurrentUri(t)).toBe('/v/a.md');
    const t2 = pushNavigateOnTab(t, '/v/b.md');
    expect(tabCurrentUri(t2)).toBe('/v/b.md');
  });

  it('pickNeighborTabIdAfterRemovingTab prefers right then left', () => {
    const a = createEditorWorkspaceTab('/a.md');
    const b = createEditorWorkspaceTab('/b.md');
    const c = createEditorWorkspaceTab('/c.md');
    expect(pickNeighborTabIdAfterRemovingTab([a, b, c], a.id)).toBe(b.id);
    expect(pickNeighborTabIdAfterRemovingTab([a, b, c], c.id)).toBe(b.id);
  });

  it('collectDistinctUrisFromTabs dedupes across tab histories', () => {
    let t1 = createEditorWorkspaceTab('/x.md');
    t1 = pushNavigateOnTab(t1, '/y.md');
    const t2 = createEditorWorkspaceTab('/y.md');
    const u = collectDistinctUrisFromTabs([t1, t2]);
    expect(u.sort()).toEqual(['/x.md', '/y.md'].sort());
  });

  it('removeUriFromAllTabs drops empty tabs', () => {
    const a = createEditorWorkspaceTab('/gone.md');
    const b = createEditorWorkspaceTab('/stay.md');
    const next = removeUriFromAllTabs([a, b], u => u === '/gone.md');
    expect(next.length).toBe(1);
    expect(tabCurrentUri(next[0]!)).toBe('/stay.md');
  });

  it('ensureActiveTabId falls back to first tab', () => {
    const a = createEditorWorkspaceTab('/a.md');
    expect(ensureActiveTabId([a], 'missing')).toBe(a.id);
    expect(ensureActiveTabId([a], a.id)).toBe(a.id);
  });

  it('findTabIdWithCurrentUri matches current history slot only', () => {
    const a = createEditorWorkspaceTab('/a.md');
    let b = createEditorWorkspaceTab('/b.md');
    b = pushNavigateOnTab(b, '/c.md');
    const tabs = [a, b];
    expect(findTabIdWithCurrentUri(tabs, '/a.md')).toBe(a.id);
    expect(findTabIdWithCurrentUri(tabs, ' /c.md ')).toBe(b.id);
    expect(findTabIdWithCurrentUri(tabs, '/b.md')).toBeNull();
  });

  it('migrateOpenTabUrisToWorkspaceTabs dedupes', () => {
    const tabs = migrateOpenTabUrisToWorkspaceTabs(['/a.md', '/a.md', '/b.md']);
    expect(tabs.length).toBe(2);
  });

  it('insertTabAfterActive places after active or at 0', () => {
    const a = createEditorWorkspaceTab('/a.md');
    const b = createEditorWorkspaceTab('/b.md');
    const c = createEditorWorkspaceTab('/c.md');
    const n = createEditorWorkspaceTab('/new.md');
    const tabs = [a, b, c];
    expect(insertTabAfterActive(tabs, a.id, n).map(t => tabCurrentUri(t))).toEqual([
      '/a.md',
      '/new.md',
      '/b.md',
      '/c.md',
    ]);
    expect(insertTabAfterActive(tabs, b.id, n).map(t => tabCurrentUri(t))).toEqual([
      '/a.md',
      '/b.md',
      '/new.md',
      '/c.md',
    ]);
    expect(insertTabAfterActive(tabs, c.id, n).map(t => tabCurrentUri(t))).toEqual([
      '/a.md',
      '/b.md',
      '/c.md',
      '/new.md',
    ]);
    expect(insertTabAfterActive(tabs, null, n).map(t => tabCurrentUri(t))).toEqual([
      '/new.md',
      '/a.md',
      '/b.md',
      '/c.md',
    ]);
    expect(insertTabAfterActive(tabs, 'missing', n).map(t => tabCurrentUri(t))).toEqual([
      '/new.md',
      '/a.md',
      '/b.md',
      '/c.md',
    ]);
    expect(insertTabAfterActive([], null, n).map(t => tabCurrentUri(t))).toEqual(['/new.md']);
  });

  it('insertTabAtIndex clamps and splices', () => {
    const a = createEditorWorkspaceTab('/a.md');
    const b = createEditorWorkspaceTab('/b.md');
    const n = createEditorWorkspaceTab('/new.md');
    const tabs = [a, b];
    expect(insertTabAtIndex(tabs, 0, n).map(t => tabCurrentUri(t))).toEqual([
      '/new.md',
      '/a.md',
      '/b.md',
    ]);
    expect(insertTabAtIndex(tabs, 2, n).map(t => tabCurrentUri(t))).toEqual([
      '/a.md',
      '/b.md',
      '/new.md',
    ]);
    expect(insertTabAtIndex(tabs, 99, n).map(t => tabCurrentUri(t))).toEqual([
      '/a.md',
      '/b.md',
      '/new.md',
    ]);
    expect(insertTabAtIndex(tabs, -5, n).map(t => tabCurrentUri(t))).toEqual([
      '/new.md',
      '/a.md',
      '/b.md',
    ]);
    expect(insertTabAtIndex([], 0, n).map(t => tabCurrentUri(t))).toEqual(['/new.md']);
  });

  it('reorderEditorWorkspaceTabsInArray moves tab before target index', () => {
    const a = createEditorWorkspaceTab('/a.md');
    const b = createEditorWorkspaceTab('/b.md');
    const c = createEditorWorkspaceTab('/c.md');
    const tabs = [a, b, c];
    const r1 = reorderEditorWorkspaceTabsInArray(tabs, 0, 2);
    expect(r1.map(t => tabCurrentUri(t))).toEqual(['/b.md', '/a.md', '/c.md']);
    const r2 = reorderEditorWorkspaceTabsInArray(tabs, 2, 0);
    expect(r2.map(t => tabCurrentUri(t))).toEqual(['/c.md', '/a.md', '/b.md']);
    const r3 = reorderEditorWorkspaceTabsInArray(tabs, 1, 1);
    expect(r3.map(t => tabCurrentUri(t))).toEqual(['/a.md', '/b.md', '/c.md']);
  });

  it('tabsToStored round-trips via tabsFromStored', () => {
    const t1 = {
      ...createEditorWorkspaceTab('/a.md'),
      history: pushEditorHistoryEntry(createEditorWorkspaceTab('/a.md').history, '/b.md'),
    };
    const stored = tabsToStored([t1]);
    const back = tabsFromStored(stored);
    expect(back.length).toBe(1);
    expect(tabCurrentUri(back[0]!)).toBe('/b.md');
  });
});
