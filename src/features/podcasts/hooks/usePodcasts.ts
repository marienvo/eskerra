import {useCallback, useEffect, useState} from 'react';

import {
  clearPlaylist,
  listGeneralMarkdownFiles,
  readPlaylist,
  readPodcastFileContent,
} from '../../../core/storage/noteboxStorage';
import {PodcastEpisode, PodcastSection} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {groupBySection, isPodcastFile, parsePodcastFile} from '../services/podcastParser';
import {
  extractRssFeedUrl,
  extractRssPodcastTitle,
  normalizeSeriesKey,
} from '../services/rssParser';

const RSS_PODCAST_FILE_PATTERN = /^📻\s+.+\.md$/;

type FileContentCacheEntry = {lastModified: number; content: string};
const fileContentCache = new Map<string, FileContentCacheEntry>();
const rssFeedUrlBySeriesName = new Map<string, string>();
const rssFeedUrlByNormalizedSeriesName = new Map<string, string>();

type UsePodcastsResult = {
  allEpisodes: PodcastEpisode[];
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  sections: PodcastSection[];
};

type FileWithContent = {
  content: string;
  file: {
    lastModified: number | null;
    name: string;
    uri: string;
  };
};

function getSeriesCacheKey(baseUri: string, seriesName: string): string {
  return `${baseUri}::${seriesName}`;
}

function getNormalizedSeriesCacheKey(baseUri: string, seriesName: string): string | null {
  const normalizedSeriesName = normalizeSeriesKey(seriesName);
  if (!normalizedSeriesName) {
    return null;
  }
  return `${baseUri}::${normalizedSeriesName}`;
}

function resolveCachedRssFeedUrl(baseUri: string, seriesName: string): string | undefined {
  const directMatch = rssFeedUrlBySeriesName.get(getSeriesCacheKey(baseUri, seriesName));
  if (directMatch) {
    return directMatch;
  }

  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (!normalizedKey) {
    return undefined;
  }
  return rssFeedUrlByNormalizedSeriesName.get(normalizedKey);
}

function persistRssFeedUrl(baseUri: string, seriesName: string, rssFeedUrl: string): void {
  rssFeedUrlBySeriesName.set(getSeriesCacheKey(baseUri, seriesName), rssFeedUrl);

  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (normalizedKey) {
    rssFeedUrlByNormalizedSeriesName.set(normalizedKey, rssFeedUrl);
  }
}

function enrichEpisodesWithCachedRss(
  baseUri: string,
  episodes: PodcastEpisode[],
): PodcastEpisode[] {
  return episodes.map(episode => ({
    ...episode,
    rssFeedUrl: episode.rssFeedUrl ?? resolveCachedRssFeedUrl(baseUri, episode.seriesName),
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

export function usePodcasts(): UsePodcastsResult {
  const {baseUri} = useVaultContext();
  const [allEpisodes, setAllEpisodes] = useState<PodcastEpisode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sections, setSections] = useState<PodcastSection[]>([]);

  const refresh = useCallback(async () => {
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

    const readFileContentWithCache = async (file: {
      lastModified: number | null;
      name: string;
      uri: string;
    }): Promise<FileWithContent> => {
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
    };

    try {
      const files = await listGeneralMarkdownFiles(baseUri);
      const podcastFiles = files.filter(file => isPodcastFile(file.name));
      rssFeedFiles = files.filter(file => RSS_PODCAST_FILE_PATTERN.test(file.name));

      const contentsByFile = await Promise.all(
        podcastFiles.map(file => readFileContentWithCache(file)),
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

      setAllEpisodes(nextAllEpisodes);
      setSections(nextSections);
      renderedEpisodes = nextAllEpisodes;
      knownEpisodeIds = new Set(nextAllEpisodes.map(episode => episode.id));
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
          rssFeedFiles.map(file => readFileContentWithCache(file)),
        );

        for (const {content, file} of rssContentsByFile) {
          const rssFeedUrl = extractRssFeedUrl(content);
          if (!rssFeedUrl) {
            continue;
          }
          const sectionTitle = extractRssPodcastTitle(file.name, content);
          persistRssFeedUrl(baseUri, sectionTitle, rssFeedUrl);
        }

        const enrichedEpisodes = enrichEpisodesWithCachedRss(baseUri, renderedEpisodes);
        const hasRssUpdates = enrichedEpisodes.some(
          (episode, index) => episode.rssFeedUrl !== renderedEpisodes[index]?.rssFeedUrl,
        );
        if (!hasRssUpdates) {
          return;
        }

        setAllEpisodes(enrichedEpisodes);
        setSections(createSectionsWithRss(baseUri, enrichedEpisodes));
      };

      runRssEnrichment().catch(() => undefined);
    }

    // Keep playlist cleanup off the critical render path for initial screen loading.
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
  }, [baseUri]);

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
