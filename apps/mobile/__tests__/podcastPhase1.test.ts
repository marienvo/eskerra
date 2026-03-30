import {
  listGeneralMarkdownFiles,
  readPodcastFileContent,
} from '../src/core/storage/noteboxStorage';
import {runPodcastPhase1} from '../src/features/podcasts/services/podcastPhase1';
import {
  loadPersistentArtworkUriCache,
  primeArtworkCacheFromDisk,
} from '../src/features/podcasts/services/podcastImageCache';
import {
  loadPersistentRssFeedUrlCache,
} from '../src/features/podcasts/services/rssFeedUrlCache';
import {
  loadPersistedPodcastMarkdownIndex,
  savePersistedPodcastMarkdownIndex,
} from '../src/features/podcasts/services/generalPodcastMarkdownIndexCache';
import {isPodcastFile, parsePodcastFile} from '../src/features/podcasts/services/podcastParser';

jest.mock('../src/core/storage/noteboxStorage', () => ({
  listGeneralMarkdownFiles: jest.fn(),
  readPodcastFileContent: jest.fn(),
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

jest.mock('../src/features/podcasts/services/generalPodcastMarkdownIndexCache', () => ({
  filterPodcastRelevantGeneralMarkdownFiles: jest.fn((files: unknown[]) => files),
  loadPersistedPodcastMarkdownIndex: jest.fn(),
  podcastMarkdownIndexSignature: jest.fn(() => 'sig'),
  savePersistedPodcastMarkdownIndex: jest.fn(),
  splitPodcastAndRssMarkdownFiles: jest.fn((files: unknown[]) => ({
    podcastFiles: files,
    rssFeedFiles: [],
  })),
}));

jest.mock('../src/features/podcasts/services/podcastParser', () => ({
  groupBySection: jest.fn((episodes: unknown[]) => [
    {episodes, title: 'Series A'},
  ]),
  isPodcastFile: jest.fn((name: string) => name.includes('- podcasts.md')),
  parsePodcastFile: jest.fn(),
}));

describe('runPodcastPhase1', () => {
  const listGeneralMarkdownFilesMock =
    listGeneralMarkdownFiles as jest.MockedFunction<typeof listGeneralMarkdownFiles>;
  const readPodcastFileContentMock =
    readPodcastFileContent as jest.MockedFunction<typeof readPodcastFileContent>;
  const loadPersistedPodcastMarkdownIndexMock =
    loadPersistedPodcastMarkdownIndex as jest.MockedFunction<
      typeof loadPersistedPodcastMarkdownIndex
    >;
  const savePersistedPodcastMarkdownIndexMock =
    savePersistedPodcastMarkdownIndex as jest.MockedFunction<
      typeof savePersistedPodcastMarkdownIndex
    >;
  const loadPersistentArtworkUriCacheMock =
    loadPersistentArtworkUriCache as jest.MockedFunction<typeof loadPersistentArtworkUriCache>;
  const loadPersistentRssFeedUrlCacheMock =
    loadPersistentRssFeedUrlCache as jest.MockedFunction<typeof loadPersistentRssFeedUrlCache>;
  const parsePodcastFileMock = parsePodcastFile as jest.MockedFunction<typeof parsePodcastFile>;
  const isPodcastFileMock = isPodcastFile as jest.MockedFunction<typeof isPodcastFile>;

  const baseUri = 'content://vault-podcast-test';

  const legacyEpisode = {
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
    loadPersistentArtworkUriCacheMock.mockResolvedValue();
    loadPersistentRssFeedUrlCacheMock.mockResolvedValue();
    loadPersistedPodcastMarkdownIndexMock.mockResolvedValue(null);
    listGeneralMarkdownFilesMock.mockResolvedValue([
      {
        lastModified: 1,
        name: '2026 Series A - podcasts.md',
        uri: `${baseUri}/General/2026 Series A - podcasts.md`,
      },
    ]);
    readPodcastFileContentMock.mockResolvedValue('# legacy');
    parsePodcastFileMock.mockReturnValue([legacyEpisode]);
    isPodcastFileMock.mockImplementation(name => name.includes('- podcasts.md'));
  });

  test('returns episodes after full listing when no persisted index', async () => {
    const result = await runPodcastPhase1(baseUri);

    expect(result.error).toBeNull();
    expect(result.allEpisodes).toEqual([legacyEpisode]);
    expect(result.didFullVaultListingThisRefresh).toBe(true);
    expect(listGeneralMarkdownFilesMock).toHaveBeenCalledWith(baseUri);
    expect(savePersistedPodcastMarkdownIndexMock).toHaveBeenCalled();
    expect(primeArtworkCacheFromDisk).toHaveBeenCalled();
  });
});
