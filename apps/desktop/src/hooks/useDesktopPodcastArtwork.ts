import {useEffect, useState} from 'react';

import {
  peekCachedArtworkUri,
  resolveArtworkUri,
} from '../lib/podcasts/artworkCacheDesktop';

export type UseDesktopPodcastArtworkResult = {
  /** Resolved URL or null when no artwork (after fetch or no feed). */
  artworkUrl: string | null;
  /** True while waiting for network resolution (no fresh cache entry). */
  loading: boolean;
};

/**
 * Resolve podcast cover art for an RSS feed URL (channel artwork).
 * @param rssFeedUrl — trimmed feed URL, or empty string to skip
 */
export function useDesktopPodcastArtwork(
  rssFeedUrl: string,
): UseDesktopPodcastArtworkResult {
  const [state, setState] = useState<{
    artworkUrl: string | null;
    loading: boolean;
  }>(() => {
    if (!rssFeedUrl) {
      return {artworkUrl: null, loading: false};
    }
    const peek = peekCachedArtworkUri(rssFeedUrl);
    if (peek !== undefined) {
      return {artworkUrl: peek, loading: false};
    }
    return {artworkUrl: null, loading: true};
  });

  useEffect(() => {
    let cancelled = false;
    if (!rssFeedUrl) {
      setState({artworkUrl: null, loading: false});
      return;
    }

    const peek = peekCachedArtworkUri(rssFeedUrl);
    if (peek !== undefined) {
      setState({artworkUrl: peek, loading: false});
      return;
    }

    setState({artworkUrl: null, loading: true});
    void resolveArtworkUri(rssFeedUrl).then(url => {
      if (!cancelled) {
        setState({artworkUrl: url, loading: false});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rssFeedUrl]);

  return state;
}
