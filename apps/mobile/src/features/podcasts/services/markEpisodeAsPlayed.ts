import {markEpisodeAsPlayedInContent} from '@eskerra/core';

import {
  readPodcastFileContent,
  writePodcastFileContent,
} from '../../../core/storage/eskerraStorage';
import {PodcastEpisode} from '../../../types';

const GENERAL_PREFIX_PATTERN = /^General\//;

export {markEpisodeAsPlayedInContent};

function getPodcastFileUri(baseUri: string, sourceFile: string): string {
  const normalizedSourceFile = sourceFile.replace(GENERAL_PREFIX_PATTERN, '');
  return `${baseUri}/General/${normalizedSourceFile}`;
}

export async function prepareMarkEpisodeAsPlayed(
  baseUri: string,
  episode: PodcastEpisode,
): Promise<{fileUri: string; nextContent: string} | null> {
  const fileUri = getPodcastFileUri(baseUri, episode.sourceFile);
  const content = await readPodcastFileContent(fileUri);
  const {nextContent, updated} = markEpisodeAsPlayedInContent(content, episode.mp3Url);

  if (!updated) {
    return null;
  }

  return {fileUri, nextContent};
}

export async function writePreparedMarkEpisodeAsPlayed(
  fileUri: string,
  nextContent: string,
): Promise<void> {
  await writePodcastFileContent(fileUri, nextContent);
}

export async function markEpisodeAsPlayed(
  baseUri: string,
  episode: PodcastEpisode,
): Promise<boolean> {
  const prepared = await prepareMarkEpisodeAsPlayed(baseUri, episode);
  if (!prepared) {
    return false;
  }

  await writePreparedMarkEpisodeAsPlayed(prepared.fileUri, prepared.nextContent);
  return true;
}
