import {
  listGeneralMarkdownFiles,
  readPodcastFileContent,
} from '../../../core/storage/noteboxStorage';
import {PodcastEpisode, PodcastSection, RootMarkdownFile} from '../../../types';
import {
  filterPodcastRelevantGeneralMarkdownFiles,
  loadPersistedPodcastMarkdownIndex,
  savePersistedPodcastMarkdownIndex,
  splitPodcastAndRssMarkdownFiles,
} from './generalPodcastMarkdownIndexCache';
import {groupBySection, isPodcastFile, parsePodcastFile} from './podcastParser';
import {extractRssFeedUrl, extractRssPodcastTitle} from './rssParser';
import {
  loadPersistentArtworkUriCache,
  primeArtworkCacheFromDisk,
} from './podcastImageCache';
import {
  loadPersistentRssFeedUrlCache,
  persistRssFeedUrl,
  resolveCachedRssFeedUrl,
} from './rssFeedUrlCache';

export type RefreshPodcastsOptions = {
  /**
   * When true, always runs a full SAF listing of General (slow on huge folders).
   * Use for pull-to-refresh so new podcast files appear without waiting for background reconcile.
   */
  forceFullScan?: boolean;
};

type FileContentCacheEntry = {lastModified: number; content: string};
const fileContentCache = new Map<string, FileContentCacheEntry>();

/** Clears in-memory podcast markdown bodies so the next refresh re-reads from vault after native sync. */
export function clearPodcastMarkdownFileContentCache(): void {
  fileContentCache.clear();
}

type FileWithContent = {
  content: string;
  file: {
    lastModified: number | null;
    name: string;
    uri: string;
  };
};

export function enrichEpisodesWithCachedRss(
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

export function createSectionsWithRss(
  baseUri: string,
  episodes: PodcastEpisode[],
): PodcastSection[] {
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

export async function readMarkdownWithSessionCache(
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

export async function buildPodcastSectionsFromPodcastMarkdownFiles(
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

export function primeArtworkForEpisodesAndSections(
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

export type PodcastPhase1Result = {
  allEpisodes: PodcastEpisode[];
  didFullVaultListingThisRefresh: boolean;
  error: string | null;
  podcastRelevantFiles: RootMarkdownFile[];
  rssFeedFiles: RootMarkdownFile[];
  sections: PodcastSection[];
};

/**
 * Phase-1 podcast load: caches, index/snapshot, General listing when needed, legacy markdown parse.
 * Does not schedule background reconcile or RSS phase-2; the hook owns that after mount.
 */
export async function runPodcastPhase1(
  baseUri: string,
  options?: RefreshPodcastsOptions,
): Promise<PodcastPhase1Result> {
  const forceFullScan = options?.forceFullScan ?? false;

  let rssFeedFiles: RootMarkdownFile[] = [];

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

    return {
      allEpisodes: nextAllEpisodes,
      didFullVaultListingThisRefresh,
      error: null,
      podcastRelevantFiles,
      rssFeedFiles,
      sections: nextSections,
    };
  } catch (loadError) {
    const fallbackMessage = 'Could not load podcasts from vault.';
    return {
      allEpisodes: [],
      didFullVaultListingThisRefresh: false,
      error: loadError instanceof Error ? loadError.message : fallbackMessage,
      podcastRelevantFiles: [],
      rssFeedFiles: [],
      sections: [],
    };
  }
}

export async function runRssMarkdownEnrichment(
  baseUri: string,
  renderedEpisodes: PodcastEpisode[],
  rssFeedFiles: RootMarkdownFile[],
  setAllEpisodes: (episodes: PodcastEpisode[]) => void,
  setSections: (sections: PodcastSection[]) => void,
): Promise<void> {
  if (rssFeedFiles.length === 0) {
    return;
  }

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
}
