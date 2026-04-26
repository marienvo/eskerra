import {
  groupPodcastEpisodesBySection,
  isPodcastEpisodesFile,
  parsePodcastEpisodeLine,
  parsePodcastEpisodesMarkdownFile,
} from '@eskerra/core';

import type {PodcastEpisode, PodcastSection} from './podcastTypes';

// Patterns for parsing the buildPodcastMarkdownFromRss body format (📻 files).
const PIE_DATE_HEADING = /^##\s+\w+,\s+(\w+)\s+(\d+)(?:st|nd|rd|th),\s+(\d{4})$/;
const PIE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
// Handles both angle-bracket form [▶️](<url>) from markdownLink and plain [▶️](url).
const PIE_PLAY_LINK = /\[▶️?\]\(<?(https?:\/\/[^)>]+)>?\)/g;
const PIE_WEB_LINK = /^\[🌐\]\(<?(https?:\/\/[^)>]+)>?\)\s*/;
const PIE_BULLET = /^-\s+/;

export const isPodcastFile = isPodcastEpisodesFile;

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
