import {useEffect, useState} from 'react';

import {
  getCachedPodcastArtworkUri,
  getPodcastArtworkUri,
} from '../services/podcastImageCache';

type UsePodcastArtworkOptions = {
  allowBackgroundFetch?: boolean;
};

export function usePodcastArtwork(
  baseUri: string | null,
  rssFeedUrl: string | undefined,
  options?: UsePodcastArtworkOptions,
): string | null {
  const {allowBackgroundFetch = false} = options ?? {};
  const [artworkUri, setArtworkUri] = useState<string | null>(null);

  useEffect(() => {
    const normalizedFeedUrl = rssFeedUrl?.trim();
    if (!baseUri || !normalizedFeedUrl) {
      setArtworkUri(null);
      return;
    }

    let isMounted = true;

    getCachedPodcastArtworkUri(baseUri, normalizedFeedUrl)
      .then(async cachedUri => {
        if (!isMounted) {
          return;
        }

        setArtworkUri(cachedUri);
        if (cachedUri || !allowBackgroundFetch) {
          return;
        }

        const fetchedUri = await getPodcastArtworkUri(baseUri, normalizedFeedUrl);
        if (!isMounted) {
          return;
        }
        setArtworkUri(fetchedUri);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setArtworkUri(null);
      });

    return () => {
      isMounted = false;
    };
  }, [allowBackgroundFetch, baseUri, rssFeedUrl]);

  return artworkUri;
}
