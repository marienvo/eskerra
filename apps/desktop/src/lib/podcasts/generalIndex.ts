import {isPodcastFile} from './podcastParser';
import type {RootMarkdownFile} from './podcastTypes';

function isRssPodcastMarkdownFile(fileName: string): boolean {
  const trimmed = fileName.trim();
  if (!trimmed.startsWith('📻')) {
    return false;
  }
  const tail = trimmed.slice(2).trim();
  return tail.length > 3 && tail.toLowerCase().endsWith('.md');
}

export function filterPodcastRelevantGeneralMarkdownFiles(
  files: RootMarkdownFile[],
): RootMarkdownFile[] {
  return files.filter(
    file => isPodcastFile(file.name) || isRssPodcastMarkdownFile(file.name),
  );
}

export function splitPodcastAndRssMarkdownFiles(relevant: RootMarkdownFile[]): {
  podcastFiles: RootMarkdownFile[];
  rssFeedFiles: RootMarkdownFile[];
} {
  return {
    podcastFiles: relevant.filter(file => isPodcastFile(file.name)),
    rssFeedFiles: relevant.filter(file => isRssPodcastMarkdownFile(file.name)),
  };
}
