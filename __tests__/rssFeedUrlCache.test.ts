import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadPersistentRssFeedUrlCache,
  persistRssFeedUrl,
  resetRssFeedUrlCacheForTesting,
  resolveCachedRssFeedUrl,
} from '../src/features/podcasts/services/rssFeedUrlCache';

jest.mock('../src/features/podcasts/services/rssParser', () => ({
  normalizeSeriesKey: jest.fn((value: string) => value.toLowerCase()),
}));

describe('rssFeedUrlCache', () => {
  const asyncStorageGetItemMock = AsyncStorage.getItem as jest.MockedFunction<
    typeof AsyncStorage.getItem
  >;
  const asyncStorageRemoveItemMock = AsyncStorage.removeItem as jest.MockedFunction<
    typeof AsyncStorage.removeItem
  >;
  const asyncStorageSetItemMock = AsyncStorage.setItem as jest.MockedFunction<
    typeof AsyncStorage.setItem
  >;

  async function flushPromises(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(() => resolve(), 0);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetRssFeedUrlCacheForTesting();
    asyncStorageGetItemMock.mockResolvedValue(null);
    asyncStorageSetItemMock.mockResolvedValue();
    asyncStorageRemoveItemMock.mockResolvedValue();
  });

  test('persistRssFeedUrl writes versioned payload to AsyncStorage', async () => {
    const baseUri = 'content://vault-a';
    persistRssFeedUrl(baseUri, 'My Show', 'https://example.com/feed.xml');
    await flushPromises();

    expect(asyncStorageSetItemMock).toHaveBeenCalledWith(
      'notebox:rssFeedUrlBySeries:content://vault-a',
      JSON.stringify({
        byNormalized: {'my show': 'https://example.com/feed.xml'},
        bySeries: {'My Show': 'https://example.com/feed.xml'},
        v: 1,
      }),
    );
  });

  test('loadPersistentRssFeedUrlCache hydrates resolveCachedRssFeedUrl', async () => {
    const baseUri = 'content://vault-b';
    asyncStorageGetItemMock.mockResolvedValue(
      JSON.stringify({
        byNormalized: {'alpha': 'https://feeds.example.com/a.xml'},
        bySeries: {'Alpha': 'https://feeds.example.com/a.xml'},
        v: 1,
      }),
    );

    await loadPersistentRssFeedUrlCache(baseUri);

    expect(resolveCachedRssFeedUrl(baseUri, 'Alpha')).toBe('https://feeds.example.com/a.xml');
  });

  test('loadPersistentRssFeedUrlCache does not overwrite existing in-memory entries', async () => {
    const baseUri = 'content://vault-c';
    persistRssFeedUrl(baseUri, 'Alpha', 'https://new.example.com/feed.xml');

    asyncStorageGetItemMock.mockResolvedValue(
      JSON.stringify({
        byNormalized: {'alpha': 'https://old.example.com/feed.xml'},
        bySeries: {'Alpha': 'https://old.example.com/feed.xml'},
        v: 1,
      }),
    );

    await loadPersistentRssFeedUrlCache(baseUri);

    expect(resolveCachedRssFeedUrl(baseUri, 'Alpha')).toBe('https://new.example.com/feed.xml');
  });

  test('loadPersistentRssFeedUrlCache ignores malformed JSON', async () => {
    asyncStorageGetItemMock.mockResolvedValue('not-json');
    await loadPersistentRssFeedUrlCache('content://vault-d');
    expect(resolveCachedRssFeedUrl('content://vault-d', 'Any')).toBeUndefined();
  });

  test('loadPersistentRssFeedUrlCache ignores wrong schema version', async () => {
    asyncStorageGetItemMock.mockResolvedValue(
      JSON.stringify({
        byNormalized: {},
        bySeries: {'X': 'https://x.test/f.xml'},
        v: 99,
      }),
    );
    await loadPersistentRssFeedUrlCache('content://vault-e');
    expect(resolveCachedRssFeedUrl('content://vault-e', 'X')).toBeUndefined();
  });
});
