import {isPodcastFile} from '../lib/podcasts/podcastParser';

function looksLikeRssEpisodeMarkdownName(name: string): boolean {
  if (!name.endsWith('.md') || !name.startsWith('📻')) {
    return false;
  }
  const middle = name.slice('📻'.length, -'.md'.length);
  return middle.trim().length > 0;
}

export function isPodcastRelevantVaultPath(path: string): boolean {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  return isPodcastFile(name) || looksLikeRssEpisodeMarkdownName(name);
}
