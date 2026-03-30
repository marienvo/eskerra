import {isPodcastFile} from './podcastParser';
import type {RootMarkdownFile} from './podcastTypes';

const RSS_PODCAST_FILE_PATTERN = /^📻\s+.+\.md$/;

export function filterPodcastRelevantGeneralMarkdownFiles(
  files: RootMarkdownFile[],
): RootMarkdownFile[] {
  return files.filter(
    file => isPodcastFile(file.name) || RSS_PODCAST_FILE_PATTERN.test(file.name),
  );
}

export function splitPodcastAndRssMarkdownFiles(relevant: RootMarkdownFile[]): {
  podcastFiles: RootMarkdownFile[];
  rssFeedFiles: RootMarkdownFile[];
} {
  return {
    podcastFiles: relevant.filter(file => isPodcastFile(file.name)),
    rssFeedFiles: relevant.filter(file => RSS_PODCAST_FILE_PATTERN.test(file.name)),
  };
}
