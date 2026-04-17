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
  /** URI of the `📻 … .md` General note for this series, when resolved from catalog. */
  podcastNoteUri?: string;
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
