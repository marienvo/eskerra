import {PodcastEpisode, PodcastSection} from '../../../types';

const PODCAST_FILE_PATTERN = /^(\d{4})\s+(.+?)\s+-\s+podcasts\.md$/i;
const EPISODE_PREFIX_PATTERN = /^-\s*\[([ xX])\]\s+/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})\s*;\s*(.+)$/;
const PLAY_LINK_PATTERN = /\[▶️?\]\(([^)]+)\)/g;
const ARTICLE_LINK_PATTERN = /^\[🌐\]\(([^)]+)\)\s*/;
const SERIES_PATTERN = /\(([^()]+)\)\s*$/;

type PodcastFileDetails = {
  sectionTitle: string;
  year: number;
};

type ParsePodcastLineInput = {
  line: string;
  sectionTitle: string;
  sourceFile: string;
};

function parsePodcastFileDetails(
  fileName: string,
): PodcastFileDetails | null {
  const match = PODCAST_FILE_PATTERN.exec(fileName.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const sectionTitle = match[2].trim();

  if (!sectionTitle) {
    return null;
  }

  return {sectionTitle, year};
}

function isSupportedYear(year: number, currentYear: number): boolean {
  return year === currentYear || year === currentYear + 1;
}

export function isPodcastFile(
  fileName: string,
  currentYear = new Date().getFullYear(),
): boolean {
  const details = parsePodcastFileDetails(fileName);

  if (!details) {
    return false;
  }

  return isSupportedYear(details.year, currentYear);
}

export function extractSectionTitle(fileName: string): string | null {
  const details = parsePodcastFileDetails(fileName);
  return details?.sectionTitle ?? null;
}

export function parsePodcastLine({
  line,
  sectionTitle,
  sourceFile,
}: ParsePodcastLineInput): PodcastEpisode | null {
  const trimmedLine = line.trim();
  const prefixMatch = EPISODE_PREFIX_PATTERN.exec(trimmedLine);

  if (!prefixMatch) {
    return null;
  }

  const isListened = prefixMatch[1].toLowerCase() === 'x';
  const withoutPrefix = trimmedLine.slice(prefixMatch[0].length).trim();
  const dateMatch = DATE_PREFIX_PATTERN.exec(withoutPrefix);

  if (!dateMatch) {
    return null;
  }

  const date = dateMatch[1];
  const remainder = dateMatch[2];

  const playMatches = Array.from(remainder.matchAll(PLAY_LINK_PATTERN));
  const lastPlayMatch = playMatches.at(-1);
  if (!lastPlayMatch || typeof lastPlayMatch.index !== 'number') {
    return null;
  }

  const mp3Url = lastPlayMatch[1].trim();
  if (!mp3Url) {
    return null;
  }

  const beforePlayLink = remainder.slice(0, lastPlayMatch.index).trim();
  const seriesMatch = SERIES_PATTERN.exec(remainder);
  if (!seriesMatch) {
    return null;
  }

  const seriesName = seriesMatch[1].trim();
  if (!seriesName) {
    return null;
  }

  let articleUrl: string | undefined;
  let title = beforePlayLink;
  const articleMatch = ARTICLE_LINK_PATTERN.exec(beforePlayLink);
  if (articleMatch) {
    articleUrl = articleMatch[1].trim();
    title = beforePlayLink.slice(articleMatch[0].length).trim();
  }

  if (!title) {
    return null;
  }

  return {
    articleUrl,
    date,
    id: mp3Url,
    isListened,
    mp3Url,
    sectionTitle,
    seriesName,
    sourceFile,
    title,
  };
}

export function parsePodcastFile(
  fileName: string,
  content: string,
  currentYear = new Date().getFullYear(),
): PodcastEpisode[] {
  const details = parsePodcastFileDetails(fileName);

  if (!details || !isSupportedYear(details.year, currentYear)) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map(line =>
      parsePodcastLine({
        line,
        sectionTitle: details.sectionTitle,
        sourceFile: fileName,
      }),
    )
    .filter((episode): episode is PodcastEpisode => episode !== null);
}

export function groupBySection(episodes: PodcastEpisode[]): PodcastSection[] {
  const bySection = new Map<string, PodcastEpisode[]>();

  for (const episode of episodes) {
    const currentGroup = bySection.get(episode.sectionTitle) ?? [];
    currentGroup.push(episode);
    bySection.set(episode.sectionTitle, currentGroup);
  }

  return Array.from(bySection.entries())
    .map(([title, groupedEpisodes]) => ({
      episodes: groupedEpisodes.sort((left, right) =>
        right.date.localeCompare(left.date),
      ),
      title,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}
