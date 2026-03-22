import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {usePodcastArtwork} from '../src/features/podcasts/hooks/usePodcastArtwork';
import {
  getCachedPodcastArtworkUri,
  getPodcastArtworkUri,
  peekCachedPodcastArtworkUriFromMemory,
} from '../src/features/podcasts/services/podcastImageCache';

jest.mock('../src/features/podcasts/services/podcastImageCache', () => ({
  getCachedPodcastArtworkUri: jest.fn(),
  getPodcastArtworkUri: jest.fn(),
  peekCachedPodcastArtworkUriFromMemory: jest.fn(() => null),
}));

type HookHarnessProps = {
  allowBackgroundFetch?: boolean;
  baseUri: string | null;
  onResult: (value: string | null) => void;
  rssFeedUrl?: string;
};

function HookHarness({
  allowBackgroundFetch,
  baseUri,
  onResult,
  rssFeedUrl,
}: HookHarnessProps) {
  const artworkUri = usePodcastArtwork(baseUri, rssFeedUrl, {
    allowBackgroundFetch,
  });

  useEffect(() => {
    onResult(artworkUri);
  }, [artworkUri, onResult]);

  return null;
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

describe('usePodcastArtwork', () => {
  const getCachedPodcastArtworkUriMock =
    getCachedPodcastArtworkUri as jest.MockedFunction<typeof getCachedPodcastArtworkUri>;
  const getPodcastArtworkUriMock = getPodcastArtworkUri as jest.MockedFunction<
    typeof getPodcastArtworkUri
  >;
  const peekCachedPodcastArtworkUriFromMemoryMock =
    peekCachedPodcastArtworkUriFromMemory as jest.MockedFunction<
      typeof peekCachedPodcastArtworkUriFromMemory
    >;

  beforeEach(() => {
    jest.clearAllMocks();
    peekCachedPodcastArtworkUriFromMemoryMock.mockReturnValue(null);
  });

  test('returns memory peek synchronously on first paint when available', async () => {
    peekCachedPodcastArtworkUriFromMemoryMock.mockReturnValue(
      'content://vault/.notebox/podcast-images/rss-peek.jpg',
    );
    getCachedPodcastArtworkUriMock.mockResolvedValueOnce(
      'content://vault/.notebox/podcast-images/rss-peek.jpg',
    );
    const values: Array<string | null> = [];

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          baseUri: 'content://vault',
          onResult: value => values.push(value),
          rssFeedUrl: 'https://feed.example.com/rss.xml',
        }),
      );
      await flushPromises();
    });

    expect(values[0]).toBe('content://vault/.notebox/podcast-images/rss-peek.jpg');
    expect(getPodcastArtworkUriMock).not.toHaveBeenCalled();
  });

  test('returns cached artwork asynchronously without fetching RSS', async () => {
    getCachedPodcastArtworkUriMock.mockResolvedValueOnce(
      'content://vault/.notebox/podcast-images/rss-abc.jpg',
    );
    const values: Array<string | null> = [];

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          baseUri: 'content://vault',
          onResult: value => values.push(value),
          rssFeedUrl: 'https://feed.example.com/rss.xml',
        }),
      );
      await flushPromises();
    });

    expect(values[0]).toBeNull();
    expect(values).toContain('content://vault/.notebox/podcast-images/rss-abc.jpg');
    expect(getPodcastArtworkUriMock).not.toHaveBeenCalled();
  });

  test('stays null when feed URL is missing', async () => {
    const values: Array<string | null> = [];

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          baseUri: 'content://vault',
          onResult: value => values.push(value),
        }),
      );
      await flushPromises();
    });

    expect(values).toEqual([null]);
    expect(getPodcastArtworkUriMock).not.toHaveBeenCalled();
  });

  test('can fetch artwork in background when explicitly allowed', async () => {
    getCachedPodcastArtworkUriMock.mockResolvedValueOnce(null);
    getPodcastArtworkUriMock.mockResolvedValueOnce(
      'content://vault/.notebox/podcast-images/rss-fetched.jpg',
    );
    const values: Array<string | null> = [];

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          allowBackgroundFetch: true,
          baseUri: 'content://vault',
          onResult: value => values.push(value),
          rssFeedUrl: 'https://feed.example.com/rss.xml',
        }),
      );
      await flushPromises();
      await flushPromises();
    });

    expect(values[0]).toBeNull();
    expect(values).toContain('content://vault/.notebox/podcast-images/rss-fetched.jpg');
    expect(getPodcastArtworkUriMock).toHaveBeenCalledWith(
      'content://vault',
      'https://feed.example.com/rss.xml',
    );
  });
});
