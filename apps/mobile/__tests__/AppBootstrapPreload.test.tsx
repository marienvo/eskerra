import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {resolveInitialRoute} from '../src/core/bootstrap/resolveInitialRoute';
import {prepareVaultSession} from '../src/core/vault/applyVaultSession';
import {readPlaylistCoalesced} from '../src/core/storage/noteboxStorage';
import {setPodcastBootstrapPayload} from '../src/features/podcasts/services/podcastBootstrapCache';
import {runPodcastPhase1} from '../src/features/podcasts/services/podcastPhase1';
import {appBreadcrumb} from '../src/core/observability/appBreadcrumb';

type VaultInitialSessionShape = {
  uri: string;
  settings: Record<string, unknown>;
  localSettings: {deviceName: string; displayName: string};
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: Array<{lastModified: number | null; name: string; uri: string}> | null;
};

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

jest.mock('@gluestack-ui/config', () => ({
  config: {},
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('../src/core/bootstrap/resolveInitialRoute', () => ({
  resolveInitialRoute: jest.fn(),
}));

jest.mock('../src/core/vault/applyVaultSession', () => ({
  prepareVaultSession: jest.fn(),
}));

jest.mock('../src/core/storage/noteboxStorage', () => ({
  readPlaylistCoalesced: jest.fn(),
  writePlaylist: jest.fn(),
  clearPlaylist: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastPhase1', () => ({
  runPodcastPhase1: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastBootstrapCache', () => ({
  setPodcastBootstrapPayload: jest.fn(),
}));

jest.mock('../src/core/observability/appBreadcrumb', () => ({
  appBreadcrumb: jest.fn(),
}));

let capturedVaultInitialSession: VaultInitialSessionShape | null = null;
const mockVaultContextValue = {
  baseUri: null,
  clearInboxContentCache: jest.fn(),
  consumeInboxPrefetch: () => null,
  getInboxNoteContentFromCache: () => undefined,
  isLoading: false,
  pruneInboxNoteContentFromCache: jest.fn(),
  refreshSession: jest.fn(),
  replaceInboxContentFromSession: jest.fn(),
  setInboxNoteContentInCache: jest.fn(),
  setSessionUri: jest.fn(),
  settings: null,
  setSettings: jest.fn(),
  localSettings: null,
  setLocalSettings: jest.fn(),
};

jest.mock('../src/core/vault/VaultContext', () => ({
  VaultProvider: jest.fn(({children, initialSession}) => {
    capturedVaultInitialSession = initialSession as any;
    return <>{children}</>;
  }),
  useVaultContext: jest.fn(() => mockVaultContextValue),
}));

jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: jest.fn(() => null),
}));

jest.mock('../src/core/observability/reportUnexpectedError', () => ({
  reportUnexpectedError: jest.fn(),
}));

jest.mock('../src/core/storage/appStorage', () => ({
  clearUri: jest.fn(),
  getSavedUri: jest.fn(),
}));

describe('App bootstrap preload', () => {
  const App = require('../App').default as React.ComponentType;

  const resolveInitialRouteMock = resolveInitialRoute as jest.MockedFunction<
    typeof resolveInitialRoute
  >;
  const prepareVaultSessionMock = prepareVaultSession as jest.MockedFunction<
    typeof prepareVaultSession
  >;
  const readPlaylistCoalescedMock = readPlaylistCoalesced as jest.MockedFunction<
    typeof readPlaylistCoalesced
  >;
  const runPodcastPhase1Mock = runPodcastPhase1 as jest.MockedFunction<typeof runPodcastPhase1>;
  const setPodcastBootstrapPayloadMock = setPodcastBootstrapPayload as jest.MockedFunction<
    typeof setPodcastBootstrapPayload
  >;
  const appBreadcrumbMock = appBreadcrumb as jest.MockedFunction<typeof appBreadcrumb>;

  beforeEach(() => {
    capturedVaultInitialSession = null;
    jest.clearAllMocks();
  });

  test('preloads vault, playlist, and podcast phase-1 before rendering MainTabs', async () => {
    const savedUri = 'content://vault-root';
    resolveInitialRouteMock.mockResolvedValue({
      route: 'MainTabs',
      savedUri,
    });

    prepareVaultSessionMock.mockResolvedValue({
      inboxContentByUri: null,
      settings: {},
      localSettings: {deviceName: '', displayName: 'Notebook A'},
      inboxPrefetch: null,
      sessionPrep: 'native',
    });

    readPlaylistCoalescedMock.mockResolvedValue({
      durationMs: 1000,
      episodeId: 'episode-a',
      mp3Url: 'https://example.com/a.mp3',
      positionMs: 250,
    });

    runPodcastPhase1Mock.mockResolvedValue({
      allEpisodes: [],
      didFullVaultListingThisRefresh: true,
      error: null,
      podcastRelevantFiles: [],
      rssFeedFiles: [],
      sections: [],
    });

    await act(async () => {
      TestRenderer.create(<App />);
      await flushPromises();
    });

    expect(prepareVaultSessionMock).toHaveBeenCalledWith(savedUri);
    expect(readPlaylistCoalescedMock).toHaveBeenCalledWith(savedUri);
    expect(runPodcastPhase1Mock).toHaveBeenCalledWith(savedUri);
    expect(setPodcastBootstrapPayloadMock).toHaveBeenCalledWith(
      savedUri,
      expect.objectContaining({
        allEpisodes: [],
        didFullVaultListingThisRefresh: true,
        error: null,
        podcastRelevantFiles: [],
        rssFeedFiles: [],
        sections: [],
      }),
    );

    expect(capturedVaultInitialSession).toEqual({
      uri: savedUri,
      settings: {},
      localSettings: {deviceName: '', displayName: 'Notebook A'},
      inboxContentByUri: null,
      inboxPrefetch: null,
    });

    const messages = appBreadcrumbMock.mock.calls.map(call => call[0].message);
    expect(messages).toContain('bootstrap.vault_preload.start');
    expect(messages).toContain('bootstrap.playlist_prime.complete');
    expect(messages).toContain('bootstrap.vault_preload.complete');
    expect(messages).toContain('bootstrap.podcast_phase1.start');
    expect(messages).toContain('bootstrap.podcast_phase1.complete');
  });
});
