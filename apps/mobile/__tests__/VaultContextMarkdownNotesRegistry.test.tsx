/**
 * @format
 */
import React, {useEffect} from 'react';
import {Platform} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

import {VaultProvider, useVaultContext, type VaultContextValue} from '../src/core/vault/VaultContext';
import {getSavedUri} from '../src/core/storage/appStorage';
import {MOCK_LOCAL_SETTINGS, MOCK_SETTINGS} from '../src/dev/mockVaultData';

jest.mock('../src/core/storage/appStorage', () => ({
  getSavedUri: jest.fn(),
}));

jest.mock('../src/core/observability', () => ({
  appBreadcrumb: jest.fn(),
  reportUnexpectedError: jest.fn(),
  syncVaultSessionContext: jest.fn(),
}));

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    open: jest.fn(() =>
      Promise.resolve({
        vaultInstanceId: 'v',
        baseUriHash: 'h',
        schemaVersion: 3,
        indexReady: true,
        isBuilding: false,
        indexedNotes: 0,
        lastFullBuildAt: 0,
        lastReconciledAt: 0,
        notesRegistryReady: true,
      }),
    ),
    getIndexStatus: jest.fn(() =>
      Promise.resolve({
        vaultInstanceId: 'v',
        baseUriHash: 'h',
        schemaVersion: 3,
        indexReady: true,
        isBuilding: false,
        indexedNotes: 0,
        lastFullBuildAt: 0,
        lastReconciledAt: 0,
        notesRegistryReady: true,
      }),
    ),
    persistActiveVaultUriForWorker: jest.fn(() => Promise.resolve()),
    scheduleFullRebuild: jest.fn(() => Promise.resolve()),
    reconcile: jest.fn(() => Promise.resolve()),
    readVaultMarkdownNotes: jest.fn(),
    touchPaths: jest.fn(() => Promise.resolve()),
  },
  touchVaultSearchNoteUris: jest.fn(() => Promise.resolve()),
  touchMarkdownNoteUris: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/core/storage/androidVaultListing', () => ({
  tryListVaultMarkdownRefsNative: jest.fn(),
}));

const getSavedUriMock = getSavedUri as jest.MockedFunction<typeof getSavedUri>;
const {eskerraVaultSearch} = jest.requireMock('../src/native/eskerraVaultSearch') as {
  eskerraVaultSearch: {readVaultMarkdownNotes: jest.Mock; getIndexStatus: jest.Mock; open: jest.Mock};
};

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

describe('VaultProvider markdown notes registry (Android warm path)', () => {
  const vaultUri = 'content://tree/vault';

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android', writable: true});
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios', writable: true});
  });

  test('readVaultMarkdownNotes rows set ready without SAF list walk', async () => {
    const hubUri = `${vaultUri}/Daily/Today.md`;
    eskerraVaultSearch.readVaultMarkdownNotes.mockResolvedValue([
      {lookupName: 'today', displayName: 'Today', uri: hubUri},
      {lookupName: 'alpha', displayName: 'Alpha', uri: `${vaultUri}/Inbox/Alpha.md`},
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
    expect(latest!.vaultMarkdownRefs.map(r => r.name).sort()).toEqual(['Alpha', 'Today']);
    expect(eskerraVaultSearch.readVaultMarkdownNotes).toHaveBeenCalledWith(vaultUri);
    const {tryListVaultMarkdownRefsNative} = jest.requireMock(
      '../src/core/storage/androidVaultListing',
    ) as {tryListVaultMarkdownRefsNative: jest.Mock};
    expect(tryListVaultMarkdownRefsNative).not.toHaveBeenCalled();
  });

  test('notesRegistryReady false does not trust readVaultMarkdownNotes; uses walk', async () => {
    const hubUri = `${vaultUri}/Daily/Today.md`;
    eskerraVaultSearch.getIndexStatus.mockResolvedValue({
      vaultInstanceId: 'v',
      baseUriHash: 'h',
      schemaVersion: 3,
      indexReady: true,
      isBuilding: false,
      indexedNotes: 1,
      lastFullBuildAt: 1,
      lastReconciledAt: 0,
      notesRegistryReady: false,
    });
    eskerraVaultSearch.readVaultMarkdownNotes.mockResolvedValue([
      {lookupName: 'today', displayName: 'Today', uri: hubUri},
    ]);
    const {tryListVaultMarkdownRefsNative} = jest.requireMock(
      '../src/core/storage/androidVaultListing',
    ) as {tryListVaultMarkdownRefsNative: jest.Mock};
    tryListVaultMarkdownRefsNative.mockResolvedValue([{fileName: 'FromWalk.md', uri: `${vaultUri}/FromWalk.md`}]);

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
    expect(eskerraVaultSearch.readVaultMarkdownNotes).not.toHaveBeenCalled();
    expect(tryListVaultMarkdownRefsNative).toHaveBeenCalledWith(vaultUri);
    expect(latest!.vaultMarkdownRefsStatus).toBe('ready');
    expect(latest!.vaultMarkdownRefs.map(r => r.name)).toEqual(['FromWalk']);
  });

  test('notesRegistryReady true with empty registry settles without walk', async () => {
    eskerraVaultSearch.getIndexStatus.mockResolvedValue({
      vaultInstanceId: 'v',
      baseUriHash: 'h',
      schemaVersion: 3,
      indexReady: true,
      isBuilding: false,
      indexedNotes: 0,
      lastFullBuildAt: 0,
      lastReconciledAt: 0,
      notesRegistryReady: true,
    });
    eskerraVaultSearch.readVaultMarkdownNotes.mockResolvedValue([]);

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
    expect(eskerraVaultSearch.readVaultMarkdownNotes).toHaveBeenCalledWith(vaultUri);
    const {tryListVaultMarkdownRefsNative} = jest.requireMock(
      '../src/core/storage/androidVaultListing',
    ) as {tryListVaultMarkdownRefsNative: jest.Mock};
    expect(tryListVaultMarkdownRefsNative).not.toHaveBeenCalled();
    expect(latest!.vaultMarkdownRefsStatus).toBe('ready');
    expect(latest!.vaultMarkdownRefs).toEqual([]);
  });
});
