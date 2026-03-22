import {useEffect, useState} from 'react';

import {
  getCachedPodcastArtworkUri,
  getPodcastArtworkUri,
  peekCachedPodcastArtworkUriFromMemory,
} from '../services/podcastImageCache';

type UsePodcastArtworkOptions = {
  allowBackgroundFetch?: boolean;
};

function resolveDisplayUri(
  peek: string | null,
  cachedAsync: string | null,
  fetchedAsync: string | null,
): string | null {
  const fromPeek = peek?.trim() || null;
  const fromCached = cachedAsync?.trim() || null;
  const fromFetched = fetchedAsync?.trim() || null;
  return fromPeek ?? fromCached ?? fromFetched ?? null;
}

type AsyncFetchState = {
  cached: string | null;
  fetched: string | null;
  key: string;
};

export function usePodcastArtwork(
  baseUri: string | null,
  rssFeedUrl: string | undefined,
  options?: UsePodcastArtworkOptions,
): string | null {
  const {allowBackgroundFetch = false} = options ?? {};
  const normalizedFeedUrl = rssFeedUrl?.trim() ?? '';
  const feedKey = `${baseUri ?? ''}|${normalizedFeedUrl}`;

  const memoryPeek =
    baseUri && normalizedFeedUrl
      ? peekCachedPodcastArtworkUriFromMemory(baseUri, normalizedFeedUrl)
      : null;

  const [asyncFetch, setAsyncFetch] = useState<AsyncFetchState>({
    cached: null,
    fetched: null,
    key: '',
  });

  const asyncMatchesKey = asyncFetch.key === feedKey;
  const cachedPart = asyncMatchesKey ? asyncFetch.cached : null;
  const fetchedPart = asyncMatchesKey ? asyncFetch.fetched : null;

  useEffect(() => {
    if (!baseUri || !normalizedFeedUrl) {
      setAsyncFetch({key: feedKey, cached: null, fetched: null});
      return;
    }

    let isMounted = true;

    getCachedPodcastArtworkUri(baseUri, normalizedFeedUrl)
      .then(async cachedUri => {
        if (!isMounted) {
          return;
        }

        setAsyncFetch({key: feedKey, cached: cachedUri, fetched: null});

        if (cachedUri || !allowBackgroundFetch) {
          return;
        }

        const fetchedUri = await getPodcastArtworkUri(baseUri, normalizedFeedUrl);
        if (!isMounted) {
          return;
        }
        setAsyncFetch(previous =>
          previous.key === feedKey
            ? {...previous, fetched: fetchedUri}
            : previous,
        );
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setAsyncFetch({key: feedKey, cached: null, fetched: null});
      });

    return () => {
      isMounted = false;
    };
  }, [allowBackgroundFetch, baseUri, feedKey, normalizedFeedUrl]);

  return resolveDisplayUri(memoryPeek, cachedPart, fetchedPart);
}
