import {PodcastEpisode, PodcastSection, RootMarkdownFile} from '../../../types';

export type PodcastPhase1BootstrapPayload = {
  allEpisodes: PodcastEpisode[];
  didFullVaultListingThisRefresh: boolean;
  error: string | null;
  podcastRelevantFiles: RootMarkdownFile[];
  rssFeedFiles: RootMarkdownFile[];
  sections: PodcastSection[];
};

let cached: {baseUri: string; payload: PodcastPhase1BootstrapPayload} | null = null;

export function setPodcastBootstrapPayload(
  baseUri: string,
  payload: PodcastPhase1BootstrapPayload,
): void {
  cached = {baseUri: baseUri.trim(), payload};
}

/**
 * Returns and clears the cached bootstrap payload when `baseUri` matches.
 */
export function takePodcastBootstrapPayload(
  baseUri: string,
): PodcastPhase1BootstrapPayload | null {
  if (cached == null) {
    return null;
  }
  if (cached.baseUri !== baseUri.trim()) {
    return null;
  }
  const {payload} = cached;
  cached = null;
  return payload;
}

export function clearPodcastBootstrapCache(): void {
  cached = null;
}

export function resetPodcastBootstrapCacheForTesting(): void {
  cached = null;
}
