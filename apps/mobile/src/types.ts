export type {
  NoteboxLocalSettings,
  NoteboxSettings,
  PlaylistEntry,
} from '@notebox/core';

export type NoteSummary = {
  lastModified: number | null;
  name: string;
  uri: string;
};

export type NoteDetail = {
  content: string;
  summary: NoteSummary;
};

export type RootMarkdownFile = {
  lastModified: number | null;
  name: string;
  uri: string;
};

export type PodcastEpisode = {
  articleUrl?: string;
  date: string;
  id: string;
  isListened: boolean;
  mp3Url: string;
  rssFeedUrl?: string;
  sectionTitle: string;
  seriesName: string;
  sourceFile: string;
  title: string;
};

export type PodcastSection = {
  episodes: PodcastEpisode[];
  rssFeedUrl?: string;
  title: string;
};

export type PodcastImageCacheEntry = {
  fetchedAt: string;
  imageUrl: string;
  localImageUri?: string;
  mimeType?: string;
};
