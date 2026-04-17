import {
  getGeneralDirectoryUri,
  markEpisodeAsPlayedInContent,
  normalizeVaultBaseUri,
} from '@eskerra/core';
import type {VaultFilesystem} from '@eskerra/core';

import {
  invalidatePodcastMarkdownFileContentCacheEntry,
  primePodcastMarkdownFileContentCacheEntry,
} from './podcastPhase1Desktop';
import type {PodcastEpisode} from './podcastTypes';

const GENERAL_PREFIX_PATTERN = /^General\//;

function episodeMarkdownUri(root: string, episode: PodcastEpisode): string {
  const base = normalizeVaultBaseUri(root);
  const normalizedSourceFile = episode.sourceFile.replace(GENERAL_PREFIX_PATTERN, '');
  return `${getGeneralDirectoryUri(base)}/${normalizedSourceFile}`;
}

function parentDirectoryUri(fileUri: string): string | null {
  const i = fileUri.lastIndexOf('/');
  if (i <= 0) {
    return null;
  }
  return fileUri.slice(0, i);
}

async function tryResolveLastModifiedAfterWrite(
  fs: VaultFilesystem,
  fileUri: string,
): Promise<number | null> {
  const parent = parentDirectoryUri(fileUri);
  if (!parent) {
    return null;
  }
  try {
    const rows = await fs.listFiles(parent);
    const hit = rows.find(r => r.uri === fileUri);
    const lm = hit?.lastModified;
    if (typeof lm === 'number' && lm > 0) {
      return lm;
    }
  } catch {
    /* ignore */
  }
  return null;
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
  invalidatePodcastMarkdownFileContentCacheEntry(uri);
  const lastModified = await tryResolveLastModifiedAfterWrite(fs, uri);
  if (lastModified != null) {
    primePodcastMarkdownFileContentCacheEntry(uri, lastModified, nextContent);
  }
  return true;
}
