import {describe, expect, it} from 'vitest';

import {pushEditorHistoryEntry} from './editorDocumentHistory';
import {
  collectDistinctUrisFromTabs,
  createEditorWorkspaceTab,
  ensureActiveTabId,
  migrateOpenTabUrisToWorkspaceTabs,
  pickNeighborTabIdAfterRemovingTab,
  pushNavigateOnTab,
  removeUriFromAllTabs,
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

  it('migrateOpenTabUrisToWorkspaceTabs dedupes', () => {
    const tabs = migrateOpenTabUrisToWorkspaceTabs(['/a.md', '/a.md', '/b.md']);
    expect(tabs.length).toBe(2);
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
