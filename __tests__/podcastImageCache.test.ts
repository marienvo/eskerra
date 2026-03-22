import {
  getCachedPodcastArtworkUri,
  getPodcastArtworkUri,
  getPodcastImageCacheKey,
  PODCAST_IMAGE_CACHE_TTL_MS,
} from '../src/features/podcasts/services/podcastImageCache';
import {
  readPodcastImageCacheEntry,
  writePodcastImageFile,
  writePodcastImageCacheEntry,
} from '../src/core/storage/noteboxStorage';
import {fetchRssArtworkUrl} from '../src/features/podcasts/services/rssArtwork';

jest.mock('../src/core/storage/noteboxStorage', () => ({
  readPodcastImageCacheEntry: jest.fn(),
  writePodcastImageFile: jest.fn(),
  writePodcastImageCacheEntry: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/rssArtwork', () => ({
  fetchRssArtworkUrl: jest.fn(),
}));

describe('podcastImageCache', () => {
  const readCacheMock = readPodcastImageCacheEntry as jest.MockedFunction<
    typeof readPodcastImageCacheEntry
  >;
  const writeImageFileMock = writePodcastImageFile as jest.MockedFunction<
    typeof writePodcastImageFile
  >;
  const writeCacheMock = writePodcastImageCacheEntry as jest.MockedFunction<
    typeof writePodcastImageCacheEntry
  >;
  const fetchRssArtworkUrlMock = fetchRssArtworkUrl as jest.MockedFunction<
    typeof fetchRssArtworkUrl
  >;
  const globalFetchMock = jest.fn();

  const baseUri = 'content://vault';
  const rssFeedUrl = 'https://feed.example.com/podcast.xml';

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as {fetch: typeof fetch}).fetch =
      globalFetchMock as unknown as typeof fetch;
  });

  test('returns fresh local cache entry without fetching RSS', async () => {
    readCacheMock.mockResolvedValueOnce({
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      imageUrl: 'https://cdn.example.com/remote.jpg',
      localImageUri: 'content://vault/.notebox/podcast-images/rss-1.jpg',
    });

    await expect(getPodcastArtworkUri(baseUri, rssFeedUrl)).resolves.toBe(
      'content://vault/.notebox/podcast-images/rss-1.jpg',
    );
    expect(fetchRssArtworkUrlMock).not.toHaveBeenCalled();
    expect(globalFetchMock).not.toHaveBeenCalled();
    expect(writeCacheMock).not.toHaveBeenCalled();
  });

  test('returns only fresh entries in cached-only lookup', async () => {
    readCacheMock
      .mockResolvedValueOnce({
        fetchedAt: new Date(Date.now() - 60_000).toISOString(),
        imageUrl: 'https://cdn.example.com/remote.jpg',
        localImageUri: 'content://vault/.notebox/podcast-images/rss-2.jpg',
      })
      .mockResolvedValueOnce({
        fetchedAt: new Date(Date.now() - PODCAST_IMAGE_CACHE_TTL_MS - 60_000).toISOString(),
        imageUrl: 'https://cdn.example.com/old.jpg',
        localImageUri: 'content://vault/.notebox/podcast-images/rss-3.jpg',
      });

    await expect(getCachedPodcastArtworkUri(baseUri, rssFeedUrl)).resolves.toBe(
      'content://vault/.notebox/podcast-images/rss-2.jpg',
    );
    await expect(getCachedPodcastArtworkUri(baseUri, rssFeedUrl)).resolves.toBeNull();
  });

  test('fetches, downloads, and stores local artwork when cache is stale', async () => {
    readCacheMock.mockResolvedValueOnce({
      fetchedAt: new Date(Date.now() - PODCAST_IMAGE_CACHE_TTL_MS - 60_000).toISOString(),
      imageUrl: 'https://cdn.example.com/stale.jpg',
    });
    fetchRssArtworkUrlMock.mockResolvedValueOnce(
      'https://cdn.example.com/new-cover.png',
    );
    globalFetchMock.mockResolvedValueOnce({
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      headers: {get: () => 'image/png'},
      ok: true,
    });
    writeImageFileMock.mockResolvedValueOnce(
      'content://vault/.notebox/podcast-images/rss-local.png',
    );

    await expect(getPodcastArtworkUri(baseUri, rssFeedUrl)).resolves.toBe(
      'content://vault/.notebox/podcast-images/rss-local.png',
    );

    expect(writeImageFileMock).toHaveBeenCalledWith(
      baseUri,
      getPodcastImageCacheKey(rssFeedUrl),
      expect.any(String),
      'png',
      'image/png',
    );
    expect(writeCacheMock).toHaveBeenCalledWith(
      baseUri,
      getPodcastImageCacheKey(rssFeedUrl),
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/new-cover.png',
        localImageUri: 'content://vault/.notebox/podcast-images/rss-local.png',
        mimeType: 'image/png',
      }),
    );
  });

  test('falls back to remote image URL when download fails', async () => {
    readCacheMock.mockResolvedValueOnce(null);
    fetchRssArtworkUrlMock.mockResolvedValueOnce(
      'https://cdn.example.com/fallback.jpg',
    );
    globalFetchMock.mockResolvedValueOnce({
      ok: false,
    });

    await expect(getPodcastArtworkUri(baseUri, rssFeedUrl)).resolves.toBe(
      'https://cdn.example.com/fallback.jpg',
    );
    expect(writeImageFileMock).not.toHaveBeenCalled();
    expect(writeCacheMock).toHaveBeenCalledWith(
      baseUri,
      getPodcastImageCacheKey(rssFeedUrl),
      expect.objectContaining({
        imageUrl: 'https://cdn.example.com/fallback.jpg',
      }),
    );
  });
});
