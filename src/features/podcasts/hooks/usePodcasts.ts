import {useCallback, useEffect, useState} from 'react';

import {
  clearPlaylist,
  listGeneralMarkdownFiles,
  readPlaylist,
  readPodcastFileContent,
} from '../../../core/storage/noteboxStorage';
import {PodcastEpisode, PodcastSection, RootMarkdownFile} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {
  filterPodcastRelevantGeneralMarkdownFiles,
  loadPersistedPodcastMarkdownIndex,
  podcastMarkdownIndexSignature,
  savePersistedPodcastMarkdownIndex,
  splitPodcastAndRssMarkdownFiles,
} from '../services/generalPodcastMarkdownIndexCache';
import {groupBySection, isPodcastFile, parsePodcastFile} from '../services/podcastParser';
import {extractRssFeedUrl, extractRssPodcastTitle} from '../services/rssParser';
import {
  loadPersistentArtworkUriCache,
  primeArtworkCacheFromDisk,
} from '../services/podcastImageCache';
import {
  loadPersistentRssFeedUrlCache,
  persistRssFeedUrl,
  resolveCachedRssFeedUrl,
} from '../services/rssFeedUrlCache';

type FileContentCacheEntry = {lastModified: number; content: string};
const fileContentCache = new Map<string, FileContentCacheEntry>();

type FileWithContent = {
  content: string;
  file: {
    lastModified: number | null;
    name: string;
    uri: string;
  };
};

export type RefreshPodcastsOptions = {
  /**
   * When true, always runs a full SAF listing of General (slow on huge folders).
   * Use for pull-to-refresh so new podcast files appear without waiting for background reconcile.
   */
  forceFullScan?: boolean;
};

type UsePodcastsResult = {
  allEpisodes: PodcastEpisode[];
  error: string | null;
  isLoading: boolean;
  refresh: (options?: RefreshPodcastsOptions) => Promise<void>;
  sections: PodcastSection[];
};

function enrichEpisodesWithCachedRss(
  baseUri: string,
  episodes: PodcastEpisode[],
): PodcastEpisode[] {
  return episodes.map(episode => ({
    ...episode,
    rssFeedUrl:
      episode.rssFeedUrl ??
      resolveCachedRssFeedUrl(baseUri, episode.seriesName) ??
      resolveCachedRssFeedUrl(baseUri, episode.sectionTitle),
  }));
}

function createSectionsWithRss(baseUri: string, episodes: PodcastEpisode[]): PodcastSection[] {
  return groupBySection(episodes.filter(episode => !episode.isListened)).map(section => {
    const rssFeedUrl =
      section.episodes.find(episode => episode.rssFeedUrl)?.rssFeedUrl ??
      resolveCachedRssFeedUrl(baseUri, section.title);

    if (!rssFeedUrl && section.episodes.length > 0) {
      console.warn(
        `[Podcasts] Missing rssFeedUrl for section "${section.title}". Artwork cannot be resolved.`,
      );
    }

    return {
      ...section,
      rssFeedUrl,
    };
  });
}

async function readMarkdownWithSessionCache(
  file: RootMarkdownFile,
): Promise<FileWithContent> {
  const lastModified = file.lastModified ?? -1;
  const cached = fileContentCache.get(file.uri);
  if (cached && lastModified > 0 && cached.lastModified === lastModified) {
    return {content: cached.content, file};
  }
  const content = await readPodcastFileContent(file.uri);
  if (lastModified > 0) {
    fileContentCache.set(file.uri, {lastModified, content});
  }
  return {content, file};
}

async function buildPodcastSectionsFromPodcastMarkdownFiles(
  baseUri: string,
  podcastFiles: RootMarkdownFile[],
): Promise<{
  nextAllEpisodes: PodcastEpisode[];
  nextSections: PodcastSection[];
}> {
  const contentsByFile = await Promise.all(
    podcastFiles.map(file => readMarkdownWithSessionCache(file)),
  );

  const legacyEpisodes: PodcastEpisode[] = [];

  for (const {content, file} of contentsByFile) {
    if (isPodcastFile(file.name)) {
      legacyEpisodes.push(...parsePodcastFile(file.name, content));
    }
  }

  const legacyEpisodesWithRss = enrichEpisodesWithCachedRss(baseUri, legacyEpisodes);

  const dedupedEpisodes = new Map<string, PodcastEpisode>();
  for (const episode of legacyEpisodesWithRss) {
    if (!dedupedEpisodes.has(episode.id)) {
      dedupedEpisodes.set(episode.id, episode);
    }
  }

  const nextAllEpisodes = Array.from(dedupedEpisodes.values()).sort((left, right) =>
    right.date.localeCompare(left.date),
  );
  const nextSections = createSectionsWithRss(baseUri, nextAllEpisodes);

  return {nextAllEpisodes, nextSections};
}

function primeArtworkForEpisodesAndSections(
  baseUri: string,
  nextAllEpisodes: PodcastEpisode[],
  nextSections: PodcastSection[],
): void {
  const rssUrlsForPrime = new Set<string>();
  for (const episode of nextAllEpisodes) {
    const trimmed = episode.rssFeedUrl?.trim();
    if (trimmed) {
      rssUrlsForPrime.add(trimmed);
    }
  }
  for (const section of nextSections) {
    const trimmed = section.rssFeedUrl?.trim();
    if (trimmed) {
      rssUrlsForPrime.add(trimmed);
    }
  }
  primeArtworkCacheFromDisk(baseUri, Array.from(rssUrlsForPrime)).catch(() => undefined);
}

export function usePodcasts(): UsePodcastsResult {
  const {baseUri} = useVaultContext();
  const [allEpisodes, setAllEpisodes] = useState<PodcastEpisode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sections, setSections] = useState<PodcastSection[]>([]);

  const refresh = useCallback(
    async (options?: RefreshPodcastsOptions) => {
      const forceFullScan = options?.forceFullScan ?? false;

      if (!baseUri) {
        setAllEpisodes([]);
        setSections([]);
        return;
      }

      setError(null);
      setIsLoading(true);
      let knownEpisodeIds: Set<string> | null = null;
      let renderedEpisodes: PodcastEpisode[] | null = null;
      let rssFeedFiles: Array<{lastModified: number | null; name: string; uri: string}> = [];

      try {
        await Promise.all([
          loadPersistentArtworkUriCache(baseUri),
          loadPersistentRssFeedUrlCache(baseUri),
        ]);

        let podcastRelevantFiles: RootMarkdownFile[];
        let didFullVaultListingThisRefresh = false;

        if (!forceFullScan) {
          const persisted = await loadPersistedPodcastMarkdownIndex(baseUri);
          if (persisted !== null) {
            podcastRelevantFiles = persisted;
          } else {
            const full = await listGeneralMarkdownFiles(baseUri);
            podcastRelevantFiles = filterPodcastRelevantGeneralMarkdownFiles(full);
            await savePersistedPodcastMarkdownIndex(baseUri, podcastRelevantFiles);
            didFullVaultListingThisRefresh = true;
          }
        } else {
          const full = await listGeneralMarkdownFiles(baseUri);
          podcastRelevantFiles = filterPodcastRelevantGeneralMarkdownFiles(full);
          await savePersistedPodcastMarkdownIndex(baseUri, podcastRelevantFiles);
          didFullVaultListingThisRefresh = true;
        }

        const {podcastFiles, rssFeedFiles: rssMarkdownFiles} =
          splitPodcastAndRssMarkdownFiles(podcastRelevantFiles);
        rssFeedFiles = rssMarkdownFiles;

        const {nextAllEpisodes, nextSections} = await buildPodcastSectionsFromPodcastMarkdownFiles(
          baseUri,
          podcastFiles,
        );

        primeArtworkForEpisodesAndSections(baseUri, nextAllEpisodes, nextSections);

        setAllEpisodes(nextAllEpisodes);
        setSections(nextSections);
        renderedEpisodes = nextAllEpisodes;
        knownEpisodeIds = new Set(nextAllEpisodes.map(episode => episode.id));

        const indexSignature = podcastMarkdownIndexSignature(podcastRelevantFiles);

        if (!didFullVaultListingThisRefresh) {
          (async () => {
            try {
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
                const rssContentsByFile = await Promise.all(
                  freshRssFiles.map(file => readMarkdownWithSessionCache(file)),
                );
                const rssFeedUrls = new Set<string>();

                for (const {content, file} of rssContentsByFile) {
                  const rssFeedUrl = extractRssFeedUrl(content);
                  if (!rssFeedUrl) {
                    continue;
                  }
                  rssFeedUrls.add(rssFeedUrl);
                  const sectionTitle = extractRssPodcastTitle(file.name, content);
                  persistRssFeedUrl(baseUri, sectionTitle, rssFeedUrl);
                }

                const enrichedEpisodes = enrichEpisodesWithCachedRss(
                  baseUri,
                  rebuilt.nextAllEpisodes,
                );
                const hasRssUpdates = enrichedEpisodes.some(
                  (episode, index) =>
                    episode.rssFeedUrl !== rebuilt.nextAllEpisodes[index]?.rssFeedUrl,
                );
                if (hasRssUpdates) {
                  setAllEpisodes(enrichedEpisodes);
                  setSections(createSectionsWithRss(baseUri, enrichedEpisodes));
                }
                if (rssFeedUrls.size > 0) {
                  primeArtworkCacheFromDisk(baseUri, Array.from(rssFeedUrls)).catch(() => undefined);
                }
              }
            } catch {
              /* ignore background reconcile errors */
            }
          })().catch(() => undefined);
        }
      } catch (loadError) {
        const fallbackMessage = 'Could not load podcasts from vault.';
        setError(loadError instanceof Error ? loadError.message : fallbackMessage);
        setAllEpisodes([]);
        setSections([]);
      } finally {
        setIsLoading(false);
      }

      if (!knownEpisodeIds) {
        return;
      }

      if (renderedEpisodes && rssFeedFiles.length > 0) {
        const runRssEnrichment = async () => {
          const rssContentsByFile = await Promise.all(
            rssFeedFiles.map(file => readMarkdownWithSessionCache(file)),
          );
          const rssFeedUrls = new Set<string>();

          for (const {content, file} of rssContentsByFile) {
            const rssFeedUrl = extractRssFeedUrl(content);
            if (!rssFeedUrl) {
              continue;
            }
            rssFeedUrls.add(rssFeedUrl);
            const sectionTitle = extractRssPodcastTitle(file.name, content);
            persistRssFeedUrl(baseUri, sectionTitle, rssFeedUrl);
          }

          const enrichedEpisodes = enrichEpisodesWithCachedRss(baseUri, renderedEpisodes);
          const hasRssUpdates = enrichedEpisodes.some(
            (episode, index) => episode.rssFeedUrl !== renderedEpisodes[index]?.rssFeedUrl,
          );
          if (!hasRssUpdates) {
            primeArtworkCacheFromDisk(baseUri, Array.from(rssFeedUrls)).catch(() => undefined);
            return;
          }

          setAllEpisodes(enrichedEpisodes);
          setSections(createSectionsWithRss(baseUri, enrichedEpisodes));
          primeArtworkCacheFromDisk(baseUri, Array.from(rssFeedUrls)).catch(() => undefined);
        };

        runRssEnrichment().catch(() => undefined);
      }

      const runPlaylistHousekeeping = async () => {
        const playlistEntry = await readPlaylist(baseUri);
        if (!playlistEntry) {
          return;
        }

        if (!knownEpisodeIds.has(playlistEntry.episodeId)) {
          await clearPlaylist(baseUri);
        }
      };

      runPlaylistHousekeeping().catch(() => undefined);
    },
    [baseUri],
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  return {
    allEpisodes,
    error,
    isLoading,
    refresh,
    sections,
  };
}
