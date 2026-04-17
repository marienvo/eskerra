import {
  getGeneralDirectoryUri,
  markEpisodeAsPlayedInContent,
  normalizeVaultBaseUri,
} from '@eskerra/core';
import type {VaultFilesystem} from '@eskerra/core';

import type {PodcastEpisode} from './podcastTypes';

const GENERAL_PREFIX_PATTERN = /^General\//;

function episodeMarkdownUri(root: string, episode: PodcastEpisode): string {
  const base = normalizeVaultBaseUri(root);
  const normalizedSourceFile = episode.sourceFile.replace(GENERAL_PREFIX_PATTERN, '');
  return `${getGeneralDirectoryUri(base)}/${normalizedSourceFile}`;
}

export async function markDesktopEpisodeAsPlayed(
  root: string,
  fs: VaultFilesystem,
  episode: PodcastEpisode,
): Promise<boolean> {
  const uri = episodeMarkdownUri(root, episode);
  const content = await fs.readFile(uri, {encoding: 'utf8'});
  const {nextContent, updated} = markEpisodeAsPlayedInContent(content, episode.mp3Url);
  if (!updated) {
    return false;
  }
  await fs.writeFile(uri, nextContent, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
  return true;
}
