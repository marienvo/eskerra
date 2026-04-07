import {describe, expect, it} from 'vitest';

import {
  DEFAULT_MAIN_WINDOW_PANE_VISIBILITY,
  normalizeMainWindowUiPayload,
} from './mainWindowUiStore';

describe('normalizeMainWindowUiPayload', () => {
  it('returns null for non-objects', () => {
    expect(normalizeMainWindowUiPayload(null)).toBeNull();
    expect(normalizeMainWindowUiPayload(undefined)).toBeNull();
    expect(normalizeMainWindowUiPayload('x')).toBeNull();
    expect(normalizeMainWindowUiPayload([])).toBeNull();
  });

  it('returns null when vaultRoot is missing or blank', () => {
    expect(normalizeMainWindowUiPayload({})).toBeNull();
    expect(normalizeMainWindowUiPayload({vaultRoot: ''})).toBeNull();
    expect(normalizeMainWindowUiPayload({vaultRoot: '   '})).toBeNull();
    expect(normalizeMainWindowUiPayload({vaultRoot: 1})).toBeNull();
  });

  it('migrates legacy mainTab podcasts to episodes-only panes', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/vault',
      mainTab: 'settings',
    });
    expect(out).toEqual({
      vaultRoot: '/vault',
      vaultPaneVisible: DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.vaultPaneVisible,
      episodesPaneVisible: DEFAULT_MAIN_WINDOW_PANE_VISIBILITY.episodesPaneVisible,
      notificationsPanelVisible: true,
      inbox: {composingNewEntry: false, selectedUri: null},
    });
  });

  it('migrates legacy mainTab inbox to vault-only panes', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '  /data/v  ',
      mainTab: 'inbox',
    });
    expect(out).toEqual({
      vaultRoot: '/data/v',
      vaultPaneVisible: true,
      episodesPaneVisible: false,
      notificationsPanelVisible: true,
      inbox: {composingNewEntry: false, selectedUri: null},
    });
  });

  it('migrates legacy mainTab podcasts to episodes pane visible', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      mainTab: 'podcasts',
    });
    expect(out).toEqual({
      vaultRoot: '/v',
      vaultPaneVisible: false,
      episodesPaneVisible: true,
      notificationsPanelVisible: true,
      inbox: {composingNewEntry: false, selectedUri: null},
    });
  });

  it('prefers explicit vaultPaneVisible and episodesPaneVisible over mainTab', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      mainTab: 'inbox',
      vaultPaneVisible: false,
      episodesPaneVisible: true,
    });
    expect(out?.vaultPaneVisible).toBe(false);
    expect(out?.episodesPaneVisible).toBe(true);
  });

  it('ignores legacy playerDockVisible in stored JSON', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      mainTab: 'inbox',
      playerDockVisible: false,
    });
    expect(out).toEqual({
      vaultRoot: '/v',
      vaultPaneVisible: true,
      episodesPaneVisible: false,
      notificationsPanelVisible: true,
      inbox: {composingNewEntry: false, selectedUri: null},
    });
  });

  it('sanitizes inbox fields', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      inbox: {
        composingNewEntry: true,
        selectedUri: '  /v/Inbox/x.md  ',
      },
    });
    expect(out?.inbox).toEqual({
      composingNewEntry: true,
      selectedUri: '/v/Inbox/x.md',
    });
  });

  it('treats blank selectedUri as null', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      inbox: {selectedUri: '  '},
    });
    expect(out?.inbox.selectedUri).toBeNull();
  });

  it('ignores non-boolean inbox flags', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      inbox: {composingNewEntry: 'yes'},
    });
    expect(out?.inbox.composingNewEntry).toBe(false);
  });

  it('parses openTabUris when present', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      inbox: {
        openTabUris: ['  /v/a.md  ', '', '/v/b.md', 3 as unknown as string],
      },
    });
    expect(out?.inbox.openTabUris).toEqual(['/v/a.md', '/v/b.md']);
  });

  it('parses notificationsPanelVisible', () => {
    const hidden = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      notificationsPanelVisible: false,
    });
    expect(hidden?.notificationsPanelVisible).toBe(false);
    const invalid = normalizeMainWindowUiPayload({
      vaultRoot: '/v',
      notificationsPanelVisible: 'yes',
    });
    expect(invalid?.notificationsPanelVisible).toBe(true);
  });
});
