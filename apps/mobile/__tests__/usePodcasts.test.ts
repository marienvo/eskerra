import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {
  clearPlaylist,
  listGeneralMarkdownFiles,
  readPlaylistCoalesced,
  readPodcastFileContent,
} from '../src/core/storage/eskerraStorage';
import {useVaultContext} from '../src/core/vault/VaultContext';
import {usePodcasts} from '../src/features/podcasts/hooks/usePodcasts';
import {groupBySection, isPodcastFile, parsePodcastFile} from '../src/features/podcasts/services/podcastParser';
import {
  extractRssFeedUrl,
  extractRssPodcastTitle,
  normalizeSeriesKey,
} from '../src/features/podcasts/services/rssParser';
import {
  loadPersistentArtworkUriCache,
  primeArtworkCacheFromDisk,
} from '../src/features/podcasts/services/podcastImageCache';
import {resetRssFeedUrlCacheForTesting} from '../src/features/podcasts/services/rssFeedUrlCache';
import {PodcastEpisode} from '../src/types';

jest.mock('../src/core/storage/eskerraStorage', () => ({
  clearPlaylist: jest.fn(),
  listGeneralMarkdownFiles: jest.fn(),
  readPlaylistCoalesced: jest.fn(),
  readPodcastFileContent: jest.fn(),
}));

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastParser', () => ({
  groupBySection: jest.fn(),
  isPodcastFile: jest.fn(),
  parsePodcastFile: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/rssParser', () => ({
  extractRssFeedUrl: jest.fn(),
  extractRssPodcastTitle: jest.fn(),
  normalizeSeriesKey: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/podcastImageCache', () => ({
  loadPersistentArtworkUriCache: jest.fn(),
  primeArtworkCacheFromDisk: jest.fn(),
}));

type PodcastsHookSnapshot = {
  firstEpisodeRssFeedUrl: string | undefined;
  isLoading: boolean;
  sectionsCount: number;
};

type HookHarnessProps = {
  onResult: (result: PodcastsHookSnapshot) => void;
};

function HookHarness({onResult}: HookHarnessProps) {
  const result = usePodcasts();

  useEffect(() => {
    onResult({
      firstEpisodeRssFeedUrl: result.allEpisodes[0]?.rssFeedUrl,
      isLoading: result.isLoading,
      sectionsCount: result.sections.length,
    });
  }, [onResult, result.allEpisodes, result.isLoading, result.sections]);

  return null;
}

function flushPromises(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0);
  });
}

function createDeferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject: (reason?: unknown) => {
      if (!reject) {
        throw new Error('Deferred reject was not initialized.');
      }
      reject(reason);
    },
    resolve: (value: T) => {
      if (!resolve) {
        throw new Error('Deferred resolve was not initialized.');
      }
      resolve(value);
    },
  };
}

describe('usePodcasts loading lifecycle', () => {
  const clearPlaylistMock = clearPlaylist as jest.MockedFunction<typeof clearPlaylist>;
  const listGeneralMarkdownFilesMock =
    listGeneralMarkdownFiles as jest.MockedFunction<typeof listGeneralMarkdownFiles>;
  const readPlaylistMock = readPlaylistCoalesced as jest.MockedFunction<
    typeof readPlaylistCoalesced
  >;
  const readPodcastFileContentMock =
    readPodcastFileContent as jest.MockedFunction<typeof readPodcastFileContent>;
  const useVaultContextMock = useVaultContext as jest.MockedFunction<
    typeof useVaultContext
  >;
  const groupBySectionMock = groupBySection as jest.MockedFunction<typeof groupBySection>;
  const isPodcastFileMock = isPodcastFile as jest.MockedFunction<typeof isPodcastFile>;
  const parsePodcastFileMock = parsePodcastFile as jest.MockedFunction<typeof parsePodcastFile>;
  const extractRssFeedUrlMock = extractRssFeedUrl as jest.MockedFunction<
    typeof extractRssFeedUrl
  >;
  const extractRssPodcastTitleMock =
    extractRssPodcastTitle as jest.MockedFunction<typeof extractRssPodcastTitle>;
  const normalizeSeriesKeyMock = normalizeSeriesKey as jest.MockedFunction<
    typeof normalizeSeriesKey
  >;
  const loadPersistentArtworkUriCacheMock =
    loadPersistentArtworkUriCache as jest.MockedFunction<
      typeof loadPersistentArtworkUriCache
    >;
  const primeArtworkCacheFromDiskMock = primeArtworkCacheFromDisk as jest.MockedFunction<
    typeof primeArtworkCacheFromDisk
  >;
  const asyncStorageGetItemMock = AsyncStorage.getItem as jest.MockedFunction<
    typeof AsyncStorage.getItem
  >;
  const asyncStorageRemoveItemMock = AsyncStorage.removeItem as jest.MockedFunction<
    typeof AsyncStorage.removeItem
  >;
  const asyncStorageSetItemMock = AsyncStorage.setItem as jest.MockedFunction<
    typeof AsyncStorage.setItem
  >;

  let baseUri = 'content://vault-root';
  let baseUriCounter = 0;
  const legacyEpisode: PodcastEpisode = {
    date: '2026-03-20',
    id: 'episode-1',
    isListened: false,
    mp3Url: 'https://example.com/a.mp3',
    sectionTitle: 'Series A',
    seriesName: 'Series A',
    sourceFile: '2026 Series A - podcasts.md',
    title: 'Episode A',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorageGetItemMock.mockReset();
    asyncStorageRemoveItemMock.mockReset();
    asyncStorageSetItemMock.mockReset();
    resetRssFeedUrlCacheForTesting();
    baseUriCounter += 1;
    baseUri = `content://vault-root-${Date.now()}-${baseUriCounter}`;

    useVaultContextMock.mockReturnValue({
      baseUri,
      clearInboxContentCache: jest.fn(),
      consumeInboxPrefetch: jest.fn(() => null),
      getInboxNoteContentFromCache: () => undefined,
      isLoading: false,
      pruneInboxNoteContentFromCache: jest.fn(),
      refreshSession: jest.fn(async () => undefined),
      refreshVaultMarkdownRefs: jest.fn(),
      replaceInboxContentFromSession: jest.fn(),
      scheduleDebouncedVaultMarkdownRefsRefresh: jest.fn(),
      setInboxNoteContentInCache: jest.fn(),
      localSettings: null,
      setLocalSettings: jest.fn(),
      settings: null,
      setSessionUri: jest.fn(async () => undefined),
      setSettings: jest.fn(),
      playlistSyncGeneration: 0,
      notifyPlaylistSyncAfterVaultRefresh: jest.fn(),
      vaultMarkdownRefs: [],
      vaultMarkdownRefsError: null,
      vaultMarkdownRefsStatus: 'idle',
    });

    readPlaylistMock.mockResolvedValue(null);
    loadPersistentArtworkUriCacheMock.mockResolvedValue();
    primeArtworkCacheFromDiskMock.mockResolvedValue();
    asyncStorageGetItemMock.mockResolvedValue(null);
    asyncStorageRemoveItemMock.mockResolvedValue();
    asyncStorageSetItemMock.mockResolvedValue();
    listGeneralMarkdownFilesMock.mockResolvedValue([]);
    readPodcastFileContentMock.mockResolvedValue('# content');
    isPodcastFileMock.mockImplementation(fileName => fileName.includes('- podcasts.md'));
    parsePodcastFileMock.mockReturnValue([legacyEpisode]);
    groupBySectionMock.mockImplementation(episodes => [
      {
        episodes,
        title: 'Series A',
      },
    ]);
    extractRssFeedUrlMock.mockImplementation(content => {
      if (content.includes('rssFeedUrl:')) {
        return 'https://example.com/feed.xml';
      }
      return undefined;
    });
    extractRssPodcastTitleMock.mockReturnValue('Series A');
    normalizeSeriesKeyMock.mockImplementation(value => value.toLowerCase());
  });

  test('renders from podcast files first and enriches rssFeedUrl in background', async () => {
    const deferredRssFile = createDeferred<string>();
    listGeneralMarkdownFilesMock.mockResolvedValue([
      {
        lastModified: null,
        name: '2026 Series A - podcasts.md',
        uri: `${baseUri}/General/2026 Series A - podcasts.md`,
      },
      {
        lastModified: null,
        name: '📻 Series A.md',
        uri: `${baseUri}/General/📻 Series A.md`,
      },
    ]);
    readPodcastFileContentMock.mockImplementation(async fileUri => {
      if (fileUri.endsWith('/📻 Series A.md')) {
        return deferredRssFile.promise;
      }
      return '# legacy';
    });

    let latestResult: PodcastsHookSnapshot | null = null;
    const handleResult = (result: PodcastsHookSnapshot) => {
      latestResult = result;
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: handleResult}));
      await flushPromises();
      await flushPromises();
    });

    expect(readPlaylistMock).toHaveBeenCalledTimes(1);
    expect(readPodcastFileContentMock).toHaveBeenCalledWith(
      `${baseUri}/General/2026 Series A - podcasts.md`,
    );
    expect(readPodcastFileContentMock).toHaveBeenCalledWith(`${baseUri}/General/📻 Series A.md`);
    expect(latestResult).toEqual({
      firstEpisodeRssFeedUrl: undefined,
      isLoading: false,
      sectionsCount: 1,
    });

    await act(async () => {
      deferredRssFile.resolve(
        [
          '---',
          'rssFeedUrl: https://example.com/feed.xml',
          '---',
          '# Series A',
          '',
          'metadata',
        ].join('\n'),
      );
      await flushPromises();
    });

    expect(latestResult).toEqual({
      firstEpisodeRssFeedUrl: 'https://example.com/feed.xml',
      isLoading: false,
      sectionsCount: 1,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('applies persisted rssFeedUrl during phase 1 when AsyncStorage has series mapping', async () => {
    const feedUrl = 'https://example.com/persisted-feed.xml';
    asyncStorageGetItemMock.mockImplementation(async key => {
      if (key === `eskerra:rssFeedUrlBySeries:${baseUri}`) {
        return JSON.stringify({
          byNormalized: {'series a': feedUrl},
          bySeries: {'Series A': feedUrl},
          v: 1,
        });
      }
      return null;
    });

    listGeneralMarkdownFilesMock.mockResolvedValue([
      {
        lastModified: null,
        name: '2026 Series A - podcasts.md',
        uri: `${baseUri}/General/2026 Series A - podcasts.md`,
      },
      {
        lastModified: null,
        name: '📻 Series A.md',
        uri: `${baseUri}/General/📻 Series A.md`,
      },
    ]);

    let latestResult: PodcastsHookSnapshot | null = null;
    const handleResult = (result: PodcastsHookSnapshot) => {
      latestResult = result;
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: handleResult}));
      await flushPromises();
      await flushPromises();
    });

    expect(latestResult).toEqual({
      firstEpisodeRssFeedUrl: feedUrl,
      isLoading: false,
      sectionsCount: 1,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('enriches episode rssFeedUrl from persisted section title when seriesName differs', async () => {
    const feedUrl = 'https://example.com/section-title-feed.xml';
    asyncStorageGetItemMock.mockImplementation(async key => {
      if (key === `eskerra:rssFeedUrlBySeries:${baseUri}`) {
        return JSON.stringify({
          byNormalized: {},
          bySeries: {'File Section Name': feedUrl},
          v: 1,
        });
      }
      return null;
    });

    const divergentEpisode: PodcastEpisode = {
      ...legacyEpisode,
      sectionTitle: 'File Section Name',
      seriesName: 'Different Line Name',
    };
    parsePodcastFileMock.mockReturnValue([divergentEpisode]);
    groupBySectionMock.mockImplementation(episodes => [
      {
        episodes,
        title: 'File Section Name',
      },
    ]);

    listGeneralMarkdownFilesMock.mockResolvedValue([
      {
        lastModified: null,
        name: '2026 File Section Name - podcasts.md',
        uri: `${baseUri}/General/2026 File Section Name - podcasts.md`,
      },
    ]);

    let latestResult: PodcastsHookSnapshot | null = null;
    const handleResult = (result: PodcastsHookSnapshot) => {
      latestResult = result;
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: handleResult}));
      await flushPromises();
      await flushPromises();
    });

    expect(latestResult).toEqual({
      firstEpisodeRssFeedUrl: feedUrl,
      isLoading: false,
      sectionsCount: 1,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('with persisted podcast markdown index, background reconcile lists General', async () => {
    const entries = [
      {
        lastModified: null,
        name: '2026 Series A - podcasts.md',
        uri: `${baseUri}/General/2026 Series A - podcasts.md`,
      },
      {
        lastModified: null,
        name: '📻 Series A.md',
        uri: `${baseUri}/General/📻 Series A.md`,
      },
    ];
    asyncStorageGetItemMock.mockImplementation(async key => {
      if (key === `eskerra:generalPodcastMarkdownIndex:${baseUri}`) {
        return JSON.stringify({
          entries,
          snapshottedAt: new Date().toISOString(),
          v: 1,
        });
      }
      return null;
    });

    readPodcastFileContentMock.mockImplementation(async () => '# legacy');

    listGeneralMarkdownFilesMock.mockImplementation(async () => [
      ...entries,
      {lastModified: null, name: 'other.md', uri: `${baseUri}/General/other.md`},
    ]);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: () => {}}));
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      await new Promise<void>(resolve => setImmediate(resolve));
      await flushPromises();
      await flushPromises();
    });

    expect(listGeneralMarkdownFilesMock).toHaveBeenCalled();
    await act(async () => {
      renderer?.unmount();
    });
  });

  test('still clears stale playlist entry in background', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: null,
      episodeId: 'missing-episode',
      mp3Url: 'https://example.com/missing.mp3',
      positionMs: 1234,
    });

    let latestResult: PodcastsHookSnapshot | null = null;
    const handleResult = (result: PodcastsHookSnapshot) => {
      latestResult = result;
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: handleResult}));
      await flushPromises();
      await flushPromises();
    });

    expect(latestResult).toEqual({
      firstEpisodeRssFeedUrl: undefined,
      isLoading: false,
      sectionsCount: 1,
    });
    expect(readPlaylistMock).toHaveBeenCalled();
    expect(clearPlaylistMock).toHaveBeenCalledWith(baseUri);

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('clears playlist in background when saved episode is listened in catalog', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: null,
      episodeId: legacyEpisode.id,
      mp3Url: legacyEpisode.mp3Url,
      positionMs: 1234,
    });
    parsePodcastFileMock.mockReturnValue([{...legacyEpisode, isListened: true}]);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(HookHarness, {onResult: () => {}}));
      await flushPromises();
      await flushPromises();
    });

    expect(readPlaylistMock).toHaveBeenCalled();
    expect(clearPlaylistMock).toHaveBeenCalledWith(baseUri);

    await act(async () => {
      renderer?.unmount();
    });
  });
});
