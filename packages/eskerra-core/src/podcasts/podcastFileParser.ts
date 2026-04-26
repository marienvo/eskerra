const EPISODE_PREFIX_PATTERN = /^-\s*\[([ xX])\]\s+/;
const PLAY_LINK_PATTERN = /\[▶️?\]\(([^)]+)\)/g;
const ARTICLE_LINK_PATTERN = /^\[🌐\]\(([^)]+)\)\s*/;
const SERIES_PATTERN = /\(([^()]+)\)\s*$/;

const PODCASTS_MD_SUFFIX = 'podcasts.md';

export type PodcastMarkdownFileDetails = {
  sectionTitle: string;
  year: number;
};

export type PodcastMarkdownEpisode = {
  articleUrl?: string;
  date: string;
  id: string;
  isListened: boolean;
  mp3Url: string;
  sectionTitle: string;
  seriesName: string;
  sourceFile: string;
  title: string;
};

export type PodcastMarkdownSection = {
  episodes: PodcastMarkdownEpisode[];
  title: string;
};

export type ParsePodcastEpisodeLineInput = {
  line: string;
  sectionTitle: string;
  sourceFile: string;
};

/** Strips trailing ` - … podcasts.md` without backtracking-heavy regex (vault filenames vary). */
function stemBeforePodcastsMd(trimmed: string): string | null {
  const lower = trimmed.toLowerCase();
  if (!lower.endsWith(PODCASTS_MD_SUFFIX)) {
    return null;
  }
  const withoutExt = trimmed.slice(0, -PODCASTS_MD_SUFFIX.length).trimEnd();
  let i = withoutExt.length - 1;
  while (i >= 0 && /\s/.test(withoutExt.charAt(i))) {
    i -= 1;
  }
  if (i < 0 || withoutExt.charAt(i) !== '-') {
    return null;
  }
  i -= 1;
  while (i >= 0 && /\s/.test(withoutExt.charAt(i))) {
    i -= 1;
  }
  if (i < 0) {
    return null;
  }
  return withoutExt.slice(0, i + 1).trimEnd();
}

/** Parses `YYYY Section title` from stem without nested quantifiers. */
function parseYearAndSectionTitle(stem: string): {sectionTitle: string; year: number} | null {
  if (stem.length < 6 || !/^\d{4}$/.test(stem.slice(0, 4))) {
    return null;
  }
  let pos = 4;
  while (pos < stem.length && /\s/.test(stem.charAt(pos))) {
    pos += 1;
  }
  if (pos === 4) {
    return null;
  }
  const sectionTitle = stem.slice(pos).trim();
  const year = Number(stem.slice(0, 4));

  if (!sectionTitle) {
    return null;
  }

  return {sectionTitle, year};
}

export function parsePodcastFileDetails(fileName: string): PodcastMarkdownFileDetails | null {
  const trimmed = fileName.trim();
  const stem = stemBeforePodcastsMd(trimmed);
  if (!stem) {
    return null;
  }
  const parsed = parseYearAndSectionTitle(stem);
  if (!parsed) {
    return null;
  }
  return parsed;
}

function isSupportedYear(year: number, currentYear: number): boolean {
  return year === currentYear || year === currentYear + 1;
}

export function isPodcastEpisodesFile(
  fileName: string,
  currentYear = new Date().getFullYear(),
): boolean {
  const details = parsePodcastFileDetails(fileName);

  if (!details) {
    return false;
  }

  return isSupportedYear(details.year, currentYear);
}

export function extractPodcastSectionTitle(fileName: string): string | null {
  const details = parsePodcastFileDetails(fileName);
  return details?.sectionTitle ?? null;
}

function splitDatePrefix(value: string): {date: string; remainder: string} | null {
  const separatorIdx = value.indexOf(';');
  if (separatorIdx < 0) {
    return null;
  }
  const date = value.slice(0, separatorIdx).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const remainder = value.slice(separatorIdx + 1).trim();
  if (!remainder) {
    return null;
  }
  return {date, remainder};
}

export function parsePodcastEpisodeLine({
  line,
  sectionTitle,
  sourceFile,
}: ParsePodcastEpisodeLineInput): PodcastMarkdownEpisode | null {
  const trimmedLine = line.trim();
  const prefixMatch = EPISODE_PREFIX_PATTERN.exec(trimmedLine);

  if (!prefixMatch) {
    return null;
  }

  const isListened = prefixMatch[1].toLowerCase() === 'x';
  const withoutPrefix = trimmedLine.slice(prefixMatch[0].length).trim();
  const parsedPrefix = splitDatePrefix(withoutPrefix);
  if (!parsedPrefix) {
    return null;
  }

  const {date, remainder} = parsedPrefix;

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

export function parsePodcastEpisodesMarkdownFile(
  fileName: string,
  content: string,
  currentYear = new Date().getFullYear(),
): PodcastMarkdownEpisode[] {
  const details = parsePodcastFileDetails(fileName);

  if (!details || !isSupportedYear(details.year, currentYear)) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map(line =>
      parsePodcastEpisodeLine({
        line,
        sectionTitle: details.sectionTitle,
        sourceFile: fileName,
      }),
    )
    .filter((episode): episode is PodcastMarkdownEpisode => episode !== null);
}

export function groupPodcastEpisodesBySection(
  episodes: PodcastMarkdownEpisode[],
): PodcastMarkdownSection[] {
  const bySection = new Map<string, PodcastMarkdownEpisode[]>();

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
