import {describe, expect, it} from 'vitest';

import {normalizeMainWindowUiPayload} from './mainWindowUiStore';

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

  it('defaults invalid mainTab to podcasts', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '/vault',
      mainTab: 'settings',
    });
    expect(out).toEqual({
      vaultRoot: '/vault',
      mainTab: 'podcasts',
      playerDockVisible: true,
      notificationsPanelVisible: true,
      inbox: {composingNewEntry: false, selectedUri: null},
    });
  });

  it('accepts inbox tab and trims vaultRoot', () => {
    const out = normalizeMainWindowUiPayload({
      vaultRoot: '  /data/v  ',
      mainTab: 'inbox',
      playerDockVisible: false,
    });
    expect(out).toEqual({
      vaultRoot: '/data/v',
      mainTab: 'inbox',
      playerDockVisible: false,
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
