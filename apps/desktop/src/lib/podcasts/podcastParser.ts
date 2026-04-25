import type {PodcastEpisode, PodcastSection} from './podcastTypes';

// Patterns for parsing the buildPodcastMarkdownFromRss body format (📻 files).
const PIE_DATE_HEADING = /^##\s+\w+,\s+(\w+)\s+(\d+)(?:st|nd|rd|th),\s+(\d{4})$/;
const PIE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
// Handles both angle-bracket form [▶️](<url>) from markdownLink and plain [▶️](url).
const PIE_PLAY_LINK = /\[▶️?\]\(<?(https?:\/\/[^)>]+)>?\)/g;
const PIE_WEB_LINK = /^\[🌐\]\(<?(https?:\/\/[^)>]+)>?\)\s*/;
const PIE_BULLET = /^-\s+/;
const EPISODE_PREFIX_PATTERN = /^-\s*\[([ xX])\]\s+/;
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

function parsePodcastFileDetails(fileName: string): PodcastFileDetails | null {
  const trimmed = fileName.trim();
  const suffix = ' - podcasts.md';
  if (!trimmed.toLowerCase().endsWith(suffix)) {
    return null;
  }
  const stem = trimmed.slice(0, -suffix.length);
  const firstSpace = stem.indexOf(' ');
  if (firstSpace <= 0) {
    return null;
  }
  const yearToken = stem.slice(0, firstSpace);
  if (yearToken.length !== 4 || !/^\d{4}$/.test(yearToken)) {
    return null;
  }
  const year = Number(yearToken);
  const sectionTitle = stem.slice(firstSpace + 1).trim();

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

function parsePieHeadingDate(line: string): string | null {
  const m = PIE_DATE_HEADING.exec(line.trim());
  if (m == null) return null;
  const monthIdx = PIE_MONTHS.indexOf(m[1]);
  if (monthIdx === -1) return null;
  return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function parsePieBullet(
  line: string,
  date: string,
  seriesName: string,
  fileName: string,
): PodcastEpisode | null {
  const withoutBullet = line.trim().replace(PIE_BULLET, '');
  const playMatches = Array.from(withoutBullet.matchAll(PIE_PLAY_LINK));
  const lastPlay = playMatches.at(-1);
  if (lastPlay == null || typeof lastPlay.index !== 'number') return null;
  const mp3Url = lastPlay[1].trim();
  if (!mp3Url) return null;
  const beforePlay = withoutBullet.slice(0, lastPlay.index).trim();
  let articleUrl: string | undefined;
  let title = beforePlay;
  const webMatch = PIE_WEB_LINK.exec(beforePlay);
  if (webMatch) {
    articleUrl = webMatch[1].trim();
    title = beforePlay.slice(webMatch[0].length).trim();
  }
  if (!title) return null;
  return {articleUrl, date, id: mp3Url, isListened: false, mp3Url, sectionTitle: seriesName, seriesName, sourceFile: fileName, title};
}

export function parsePieNoteEpisodes(
  fileName: string,
  content: string,
  seriesName: string,
): PodcastEpisode[] {
  const episodes: PodcastEpisode[] = [];
  let currentDate: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headingDate = parsePieHeadingDate(trimmed);
    if (headingDate != null) {
      currentDate = headingDate;
      continue;
    }
    if (currentDate != null && PIE_BULLET.test(trimmed)) {
      const ep = parsePieBullet(trimmed, currentDate, seriesName, fileName);
      if (ep != null) episodes.push(ep);
    }
  }
  return episodes;
}
