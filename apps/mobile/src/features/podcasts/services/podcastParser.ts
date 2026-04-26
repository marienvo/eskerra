import {
  extractPodcastSectionTitle,
  groupPodcastEpisodesBySection,
  isPodcastEpisodesFile,
  parsePodcastEpisodeLine,
  parsePodcastEpisodesMarkdownFile,
} from '@eskerra/core';

import type {PodcastEpisode, PodcastSection} from '../../../types';

export const isPodcastFile = isPodcastEpisodesFile;

export const extractSectionTitle = extractPodcastSectionTitle;

export function parsePodcastLine(input: {
  line: string;
  sectionTitle: string;
  sourceFile: string;
}): PodcastEpisode | null {
  return parsePodcastEpisodeLine(input);
}

export function parsePodcastFile(
  fileName: string,
  content: string,
  currentYear = new Date().getFullYear(),
): PodcastEpisode[] {
  return parsePodcastEpisodesMarkdownFile(fileName, content, currentYear);
}

export function groupBySection(episodes: PodcastEpisode[]): PodcastSection[] {
  return groupPodcastEpisodesBySection(episodes);
}
