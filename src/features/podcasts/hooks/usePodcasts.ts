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

type UsePodcastsResult = {
  allEpisodes: PodcastEpisode[];
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  sections: PodcastSection[];
};

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

    try {
      const files = await listGeneralMarkdownFiles(baseUri);
      const podcastFiles = files.filter(file => isPodcastFile(file.name));

      const parsedByFile = await Promise.all(
        podcastFiles.map(async file => {
          const content = await readPodcastFileContent(file.uri);
          return parsePodcastFile(file.name, content);
        }),
      );

      const nextAllEpisodes = parsedByFile
        .flat()
        .sort((left, right) => right.date.localeCompare(left.date));

      const nextSections = groupBySection(
        nextAllEpisodes.filter(episode => !episode.isListened),
      );

      setAllEpisodes(nextAllEpisodes);
      setSections(nextSections);

      const playlistEntry = await readPlaylist(baseUri);
      if (playlistEntry) {
        const knownEpisodeIds = new Set(
          nextAllEpisodes.map(episode => episode.id),
        );

        if (!knownEpisodeIds.has(playlistEntry.episodeId)) {
          await clearPlaylist(baseUri);
        }
      }
    } catch (loadError) {
      const fallbackMessage = 'Could not load podcasts from vault.';
      setError(loadError instanceof Error ? loadError.message : fallbackMessage);
      setAllEpisodes([]);
      setSections([]);
    } finally {
      setIsLoading(false);
    }
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
