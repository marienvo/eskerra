import {useCallback, useEffect, useState, type Dispatch, type SetStateAction} from 'react';

import {runAfterInteractions} from '../../../core/scheduling/afterInteractions';
import {
  clearPlaylist,
  listGeneralMarkdownFiles,
  readPlaylistCoalesced,
} from '../../../core/storage/eskerraStorage';
import {PodcastEpisode, PodcastSection, RootMarkdownFile} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {
  filterPodcastRelevantGeneralMarkdownFiles,
  podcastMarkdownIndexSignature,
  savePersistedPodcastMarkdownIndex,
  splitPodcastAndRssMarkdownFiles,
} from '../services/generalPodcastMarkdownIndexCache';
import {takePodcastBootstrapPayload} from '../services/podcastBootstrapCache';
import {
  buildPodcastSectionsFromPodcastMarkdownFiles,
  createSectionsWithRss,
  primeArtworkForEpisodesAndSections,
  RefreshPodcastsOptions,
  runPodcastPhase1,
  runRssMarkdownEnrichment,
} from '../services/podcastPhase1';

export type {RefreshPodcastsOptions};

/** Defer full General/ SAF listing so it does not compete with vault session prepare on cold start. */
function backgroundGeneralReconcileDelayMs(): number {
  const g = globalThis as {__ESKERRA_JEST__?: boolean; jest?: unknown};
  if (g.__ESKERRA_JEST__ === true) {
    return 0;
  }
  if (typeof g.jest !== 'undefined') {
    return 0;
  }
  return 6000;
}

async function runBackgroundReconcile(
  baseUri: string,
  indexSignature: string,
  setAllEpisodes: (episodes: PodcastEpisode[]) => void,
  setSections: (sections: PodcastSection[]) => void,
): Promise<void> {
  const full = await listGeneralMarkdownFiles(baseUri);
  const subset = filterPodcastRelevantGeneralMarkdownFiles(full);
  await savePersistedPodcastMarkdownIndex(baseUri, subset);
  if (podcastMarkdownIndexSignature(subset) === indexSignature) {
    return;
  }

  const {podcastFiles: freshPodcastFiles, rssFeedFiles: freshRssFiles} =
    splitPodcastAndRssMarkdownFiles(subset);
  const rebuilt = await buildPodcastSectionsFromPodcastMarkdownFiles(
    baseUri,
    freshPodcastFiles,
  );
  primeArtworkForEpisodesAndSections(
    baseUri,
    rebuilt.nextAllEpisodes,
    rebuilt.nextSections,
  );
  setAllEpisodes(rebuilt.nextAllEpisodes);
  setSections(rebuilt.nextSections);

  if (freshRssFiles.length > 0) {
    await runRssMarkdownEnrichment(
      baseUri,
      rebuilt.nextAllEpisodes,
      freshRssFiles,
      setAllEpisodes,
      setSections,
    );
  }
}

type UsePodcastsResult = {
  allEpisodes: PodcastEpisode[];
  applyOptimisticEpisodePlayed: (episodeId: string) => boolean;
  catalogReady: boolean;
  error: string | null;
  isLoading: boolean;
  refresh: (options?: RefreshPodcastsOptions) => Promise<void>;
  sections: PodcastSection[];
};

async function runPlaylistHousekeeping(
  baseUri: string,
  knownEpisodeIds: Set<string>,
  renderedEpisodes: PodcastEpisode[],
): Promise<void> {
  const playlistEntry = await readPlaylistCoalesced(baseUri);
  if (!playlistEntry) {
    return;
  }
  if (!knownEpisodeIds.has(playlistEntry.episodeId)) {
    await clearPlaylist(baseUri);
    return;
  }
  const catalogEpisode = renderedEpisodes.find(ep => ep.id === playlistEntry.episodeId);
  if (catalogEpisode?.isListened) {
    await clearPlaylist(baseUri);
  }
}

function scheduleDeferredBackgroundReconcile(
  baseUri: string,
  indexSignature: string,
  setAllEpisodes: Dispatch<SetStateAction<PodcastEpisode[]>>,
  setSections: Dispatch<SetStateAction<PodcastSection[]>>,
): void {
  const runReconcile = () => {
    runBackgroundReconcile(baseUri, indexSignature, setAllEpisodes, setSections).catch(
      () => undefined,
    );
  };
  const delayMs = backgroundGeneralReconcileDelayMs();
  if (delayMs === 0) {
    setTimeout(runReconcile, 0);
  } else {
    runAfterInteractions(() => {
      setTimeout(runReconcile, delayMs);
    });
  }
}

type CatalogRefreshPostPhase = {
  knownEpisodeIds: Set<string> | null;
  renderedEpisodes: PodcastEpisode[] | null;
  rssFeedFiles: RootMarkdownFile[];
};

async function loadCatalogFromPhase1(
  baseUri: string,
  options: RefreshPodcastsOptions | undefined,
  setError: Dispatch<SetStateAction<string | null>>,
  setAllEpisodes: Dispatch<SetStateAction<PodcastEpisode[]>>,
  setSections: Dispatch<SetStateAction<PodcastSection[]>>,
): Promise<CatalogRefreshPostPhase> {
  const bootstrapPayload = takePodcastBootstrapPayload(baseUri);
  const phase1 =
    bootstrapPayload != null
      ? {
          allEpisodes: bootstrapPayload.allEpisodes,
          didFullVaultListingThisRefresh: bootstrapPayload.didFullVaultListingThisRefresh,
          error: bootstrapPayload.error,
          podcastRelevantFiles: bootstrapPayload.podcastRelevantFiles,
          rssFeedFiles: bootstrapPayload.rssFeedFiles,
          sections: bootstrapPayload.sections,
        }
      : await runPodcastPhase1(baseUri, options);

  try {
    if (phase1.error) {
      setError(phase1.error);
      setAllEpisodes([]);
      setSections([]);
      return {knownEpisodeIds: null, renderedEpisodes: null, rssFeedFiles: []};
    }

    setAllEpisodes(phase1.allEpisodes);
    setSections(phase1.sections);
    const renderedEpisodes = phase1.allEpisodes;
    const knownEpisodeIds = new Set(phase1.allEpisodes.map(episode => episode.id));
    const rssFeedFiles = phase1.rssFeedFiles;

    const indexSignature = podcastMarkdownIndexSignature(phase1.podcastRelevantFiles);

    if (!phase1.didFullVaultListingThisRefresh) {
      scheduleDeferredBackgroundReconcile(baseUri, indexSignature, setAllEpisodes, setSections);
    }

    return {knownEpisodeIds, renderedEpisodes, rssFeedFiles};
  } catch (loadError) {
    const fallbackMessage = 'Could not load podcasts from vault.';
    setError(loadError instanceof Error ? loadError.message : fallbackMessage);
    setAllEpisodes([]);
    setSections([]);
    return {knownEpisodeIds: null, renderedEpisodes: null, rssFeedFiles: []};
  }
}

export function usePodcasts(): UsePodcastsResult {
  const {baseUri, notifyPlaylistSyncAfterVaultRefresh} = useVaultContext();
  const [allEpisodes, setAllEpisodes] = useState<PodcastEpisode[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sections, setSections] = useState<PodcastSection[]>([]);

  useEffect(() => {
    setCatalogReady(false);
  }, [baseUri]);

  const refresh = useCallback(
    async (options?: RefreshPodcastsOptions) => {
      if (!baseUri) {
        setAllEpisodes([]);
        setCatalogReady(false);
        setSections([]);
        return;
      }

      setError(null);
      setIsLoading(true);
      let knownEpisodeIds: Set<string> | null = null;
      let renderedEpisodes: PodcastEpisode[] | null = null;
      let rssFeedFiles: RootMarkdownFile[] = [];

      try {
        const outcome = await loadCatalogFromPhase1(
          baseUri,
          options,
          setError,
          setAllEpisodes,
          setSections,
        );
        knownEpisodeIds = outcome.knownEpisodeIds;
        renderedEpisodes = outcome.renderedEpisodes;
        rssFeedFiles = outcome.rssFeedFiles;
      } finally {
        setCatalogReady(true);
        setIsLoading(false);
      }

      notifyPlaylistSyncAfterVaultRefresh();

      if (!knownEpisodeIds) {
        return;
      }

      if (renderedEpisodes && rssFeedFiles.length > 0) {
        runRssMarkdownEnrichment(
          baseUri,
          renderedEpisodes,
          rssFeedFiles,
          setAllEpisodes,
          setSections,
        ).catch(() => undefined);
      }

      runPlaylistHousekeeping(baseUri, knownEpisodeIds, renderedEpisodes ?? []).catch(() => undefined);
    },
    [baseUri, notifyPlaylistSyncAfterVaultRefresh],
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const applyOptimisticEpisodePlayed = useCallback(
    (episodeId: string): boolean => {
      if (!baseUri) {
        return false;
      }

      let nextEpisodes: PodcastEpisode[] | null = null;
      setAllEpisodes(previous => {
        let changed = false;
        const next = previous.map(episode => {
          if (episode.id !== episodeId || episode.isListened) {
            return episode;
          }
          changed = true;
          return {...episode, isListened: true};
        });

        if (changed) {
          nextEpisodes = next;
          return next;
        }
        return previous;
      });

      if (nextEpisodes) {
        setSections(createSectionsWithRss(baseUri, nextEpisodes));
        return true;
      }
      return false;
    },
    [baseUri],
  );

  return {
    allEpisodes,
    applyOptimisticEpisodePlayed,
    catalogReady,
    error,
    isLoading,
    refresh,
    sections,
  };
}
