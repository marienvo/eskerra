import {collectVaultMarkdownRefs} from '@eskerra/core';
import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {VaultProvider, useVaultContext, type VaultContextValue} from '../src/core/vault/VaultContext';
import {getSavedUri} from '../src/core/storage/appStorage';
import {MOCK_LOCAL_SETTINGS, MOCK_SETTINGS} from '../src/dev/mockVaultData';

jest.mock('@eskerra/core', () => {
  const actual = jest.requireActual('@eskerra/core');
  return {
    ...actual,
    collectVaultMarkdownRefs: jest.fn(),
  };
});

jest.mock('../src/core/storage/appStorage', () => ({
  getSavedUri: jest.fn(),
}));

jest.mock('../src/core/observability', () => ({
  appBreadcrumb: jest.fn(),
  reportUnexpectedError: jest.fn(),
  syncVaultSessionContext: jest.fn(),
}));

const collectVaultMarkdownRefsMock = collectVaultMarkdownRefs as jest.MockedFunction<
  typeof collectVaultMarkdownRefs
>;
const getSavedUriMock = getSavedUri as jest.MockedFunction<typeof getSavedUri>;

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function Harness({onVault}: {onVault: (v: VaultContextValue) => void}) {
  const vault = useVaultContext();
  useEffect(() => {
    onVault(vault);
  });
  return null;
}

describe('VaultProvider vault markdown refs (wiki index)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('indexes markdown refs when initial session uri is set', async () => {
    const vaultUri = 'content://tree/vault';
    collectVaultMarkdownRefsMock.mockResolvedValue([
      {name: 'Alpha', uri: `${vaultUri}/Inbox/Alpha.md`},
    ]);

    getSavedUriMock.mockResolvedValue(vaultUri);

    let latest: VaultContextValue | null = null;

    await act(async () => {
      TestRenderer.create(
        <VaultProvider
          initialSession={{
            uri: vaultUri,
            settings: MOCK_SETTINGS,
            localSettings: MOCK_LOCAL_SETTINGS,
            inboxContentByUri: null,
            inboxPrefetch: [],
          }}>
          <Harness onVault={v => (latest = v)} />
        </VaultProvider>,
      );
      await flushPromises();
    });

    expect(latest).not.toBeNull();
    expect(latest!.vaultMarkdownRefsStatus).toBe('ready');
    expect(latest!.vaultMarkdownRefs).toHaveLength(1);
    expect(latest!.vaultMarkdownRefs[0]!.name).toBe('Alpha');
    expect(collectVaultMarkdownRefsMock).toHaveBeenCalledTimes(1);
  });

  test('refreshVaultMarkdownRefs triggers a second collect for the same vault', async () => {
    const vaultUri = 'content://tree/v2';
    collectVaultMarkdownRefsMock.mockResolvedValue([{name: 'One', uri: `${vaultUri}/a.md`}]);

    getSavedUriMock.mockResolvedValue(vaultUri);

    let latest: VaultContextValue | null = null;

    await act(async () => {
      TestRenderer.create(
        <VaultProvider
          initialSession={{
            uri: vaultUri,
            settings: MOCK_SETTINGS,
            localSettings: MOCK_LOCAL_SETTINGS,
            inboxContentByUri: null,
            inboxPrefetch: [],
          }}>
          <Harness onVault={v => (latest = v)} />
        </VaultProvider>,
      );
      await flushPromises();
    });

    expect(collectVaultMarkdownRefsMock).toHaveBeenCalledTimes(1);

    collectVaultMarkdownRefsMock.mockResolvedValue([
      {name: 'One', uri: `${vaultUri}/a.md`},
      {name: 'Two', uri: `${vaultUri}/b.md`},
    ]);

    await act(async () => {
      latest!.refreshVaultMarkdownRefs();
      await flushPromises();
    });

    expect(collectVaultMarkdownRefsMock).toHaveBeenCalledTimes(2);
    expect(latest!.vaultMarkdownRefs).toHaveLength(2);
  });
});
