import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {
  listGeneralMarkdownFiles,
  readPlaylistCoalesced,
} from '../src/core/storage/noteboxStorage';
import {useVaultContext} from '../src/core/vault/VaultContext';
import {takePodcastBootstrapPayload} from '../src/features/podcasts/services/podcastBootstrapCache';
import {runPodcastPhase1} from '../src/features/podcasts/services/podcastPhase1';
import {usePodcasts} from '../src/features/podcasts/hooks/usePodcasts';

jest.mock('../src/core/storage/noteboxStorage', () => ({
  clearPlaylist: jest.fn(),
  listGeneralMarkdownFiles: jest.fn(),
  readPlaylistCoalesced: jest.fn(),
  readPodcastFileContent: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastBootstrapCache', () => ({
  setPodcastBootstrapPayload: jest.fn(),
  takePodcastBootstrapPayload: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastPhase1', () => ({
  buildPodcastSectionsFromPodcastMarkdownFiles: jest.fn(),
  primeArtworkForEpisodesAndSections: jest.fn(),
  RefreshPodcastsOptions: {},
  runPodcastPhase1: jest.fn(),
  runRssMarkdownEnrichment: jest.fn(),
}));

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/generalPodcastMarkdownIndexCache', () => ({
  filterPodcastRelevantGeneralMarkdownFiles: jest.fn(),
  podcastMarkdownIndexSignature: jest.fn(() => 'sig'),
  savePersistedPodcastMarkdownIndex: jest.fn(),
  splitPodcastAndRssMarkdownFiles: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastImageCache', () => ({
  loadPersistentArtworkUriCache: jest.fn(),
  primeArtworkCacheFromDisk: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/features/podcasts/services/rssFeedUrlCache', () => ({
  loadPersistentRssFeedUrlCache: jest.fn(),
  persistRssFeedUrl: jest.fn(),
  resolveCachedRssFeedUrl: jest.fn(),
}));

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

type HarnessSnapshot = {
  allEpisodesCount: number;
  sectionsCount: number;
};

function Harness({onResult}: {onResult: (s: HarnessSnapshot) => void}) {
  const result = usePodcasts();
  useEffect(() => {
    onResult({
      allEpisodesCount: result.allEpisodes.length,
      sectionsCount: result.sections.length,
    });
  }, [onResult, result.allEpisodes.length, result.sections.length]);
  return null;
}

describe('usePodcasts bootstrap cache', () => {
  const listGeneralMarkdownFilesMock =
    listGeneralMarkdownFiles as jest.MockedFunction<typeof listGeneralMarkdownFiles>;
  const readPlaylistCoalescedMock = readPlaylistCoalesced as jest.MockedFunction<
    typeof readPlaylistCoalesced
  >;
  const takePodcastBootstrapPayloadMock =
    takePodcastBootstrapPayload as jest.MockedFunction<typeof takePodcastBootstrapPayload>;
  const runPodcastPhase1Mock = runPodcastPhase1 as jest.MockedFunction<typeof runPodcastPhase1>;
  const useVaultContextMock = useVaultContext as jest.MockedFunction<typeof useVaultContext>;

  const baseUri = 'content://vault-bootstrap-cache';

  beforeEach(() => {
    jest.clearAllMocks();
    useVaultContextMock.mockReturnValue({
      baseUri,
      clearInboxContentCache: jest.fn(),
      consumeInboxPrefetch: jest.fn(() => null),
      getInboxNoteContentFromCache: () => undefined,
      isLoading: false,
      pruneInboxNoteContentFromCache: jest.fn(),
      refreshSession: jest.fn(async () => undefined),
      replaceInboxContentFromSession: jest.fn(),
      setInboxNoteContentInCache: jest.fn(),
      localSettings: null,
      setLocalSettings: jest.fn(),
      settings: null,
      setSessionUri: jest.fn(async () => undefined),
      setSettings: jest.fn(),
    });
    listGeneralMarkdownFilesMock.mockResolvedValue([]);
    readPlaylistCoalescedMock.mockResolvedValue(null);
    takePodcastBootstrapPayloadMock.mockReturnValue({
      allEpisodes: [
        {
          date: '2026-03-20',
          id: 'e1',
          isListened: false,
          mp3Url: 'https://example.com/a.mp3',
          sectionTitle: 'S',
          seriesName: 'S',
          sourceFile: 'f.md',
          title: 'T',
        },
      ],
      didFullVaultListingThisRefresh: true,
      error: null,
      podcastRelevantFiles: [],
      rssFeedFiles: [],
      sections: [{episodes: [], rssFeedUrl: undefined, title: 'S'}],
    });
  });

  test('hydrates from bootstrap payload without calling runPodcastPhase1', async () => {
    const latestRef: {current: HarnessSnapshot | null} = {current: null};

    await act(async () => {
      TestRenderer.create(
        <Harness
          onResult={snap => {
            latestRef.current = snap;
          }}
        />,
      );
      await flushPromises();
    });

    expect(runPodcastPhase1Mock).not.toHaveBeenCalled();
    expect(listGeneralMarkdownFilesMock).not.toHaveBeenCalled();
    expect(takePodcastBootstrapPayloadMock).toHaveBeenCalledWith(baseUri);
    const snap = latestRef.current;
    if (snap == null) {
      throw new Error('Expected harness snapshot.');
    }
    expect(snap.allEpisodesCount).toBe(1);
    expect(snap.sectionsCount).toBe(1);
  });
});
