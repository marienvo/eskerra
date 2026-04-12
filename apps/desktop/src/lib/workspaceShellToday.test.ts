import {describe, expect, it} from 'vitest';

import {
  isActiveWorkspaceTodayLinkSurface,
  shouldOpenActiveHubTodayAsShell,
  workspaceSelectShowsActiveTabPillState,
} from './workspaceShellToday';
import {createEditorWorkspaceTab, tabCurrentUri} from './editorWorkspaceTabs';

describe('shouldOpenActiveHubTodayAsShell', () => {
  it('is true only with zero tabs, matching hub, and Today file', () => {
    expect(
      shouldOpenActiveHubTodayAsShell({
        editorWorkspaceTabCount: 0,
        uri: '/vault/Daily/Today.md',
        activeTodayHubUri: '/vault/Daily/Today.md',
        uriIsTodayMarkdownFile: true,
      }),
    ).toBe(true);
    expect(
      shouldOpenActiveHubTodayAsShell({
        editorWorkspaceTabCount: 1,
        uri: '/vault/Daily/Today.md',
        activeTodayHubUri: '/vault/Daily/Today.md',
        uriIsTodayMarkdownFile: true,
      }),
    ).toBe(false);
    expect(
      shouldOpenActiveHubTodayAsShell({
        editorWorkspaceTabCount: 0,
        uri: '/vault/Daily/Today.md',
        activeTodayHubUri: '/vault/Other/Today.md',
        uriIsTodayMarkdownFile: true,
      }),
    ).toBe(false);
    expect(
      shouldOpenActiveHubTodayAsShell({
        editorWorkspaceTabCount: 0,
        uri: '/vault/Daily/Today.md',
        activeTodayHubUri: '/vault/Daily/Today.md',
        uriIsTodayMarkdownFile: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenActiveHubTodayAsShell({
        editorWorkspaceTabCount: 0,
        uri: '/vault/Daily/Today.md',
        activeTodayHubUri: null,
        uriIsTodayMarkdownFile: true,
      }),
    ).toBe(false);
  });
});

describe('workspaceSelectShowsActiveTabPillState', () => {
  it('is true when Today matches hub and no tab shows that URI', () => {
    const other = createEditorWorkspaceTab('/vault/Note.md');
    expect(
      workspaceSelectShowsActiveTabPillState({
        composingNewEntry: false,
        activeTodayHubUri: '/vault/Daily/Today.md',
        selectedUri: '/vault/Daily/Today.md',
        editorWorkspaceTabs: [other],
      }),
    ).toBe(true);
  });

  it('is false when a tab already shows the hub Today', () => {
    const todayTab = createEditorWorkspaceTab('/vault/Daily/Today.md');
    expect(
      workspaceSelectShowsActiveTabPillState({
        composingNewEntry: false,
        activeTodayHubUri: '/vault/Daily/Today.md',
        selectedUri: '/vault/Daily/Today.md',
        editorWorkspaceTabs: [todayTab],
      }),
    ).toBe(false);
    expect(tabCurrentUri(todayTab)).toBe('/vault/Daily/Today.md');
  });

  it('is false while composing', () => {
    expect(
      workspaceSelectShowsActiveTabPillState({
        composingNewEntry: true,
        activeTodayHubUri: '/vault/Daily/Today.md',
        selectedUri: '/vault/Daily/Today.md',
        editorWorkspaceTabs: [],
      }),
    ).toBe(false);
  });
});

describe('isActiveWorkspaceTodayLinkSurface', () => {
  it('detects active hub Today surface for link routing', () => {
    expect(
      isActiveWorkspaceTodayLinkSurface({
        composingNewEntry: false,
        activeTodayHubUri: '/vault/Daily/Today.md',
        selectedUri: '/vault/Daily/Today.md',
      }),
    ).toBe(true);
    expect(
      isActiveWorkspaceTodayLinkSurface({
        composingNewEntry: false,
        activeTodayHubUri: '/vault/Daily/Today.md',
        selectedUri: '/vault/Other/Today.md',
      }),
    ).toBe(false);
  });
});
