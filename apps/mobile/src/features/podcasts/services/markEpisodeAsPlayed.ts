import {
  readPodcastFileContent,
  writePodcastFileContent,
} from '../../../core/storage/noteboxStorage';
import {PodcastEpisode} from '../../../types';

const UNPLAYED_PREFIX_PATTERN = /^(\s*-\s*\[)\s(\]\s+)/;
const GENERAL_PREFIX_PATTERN = /^General\//;

export function markEpisodeAsPlayedInContent(
  content: string,
  mp3Url: string,
): {nextContent: string; updated: boolean} {
  const lines = content.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map(line => {
    if (updated || !line.includes(mp3Url)) {
      return line;
    }

    const nextLine = line.replace(UNPLAYED_PREFIX_PATTERN, '$1x$2');
    if (nextLine !== line) {
      updated = true;
    }

    return nextLine;
  });

  return {
    nextContent: nextLines.join('\n'),
    updated,
  };
}

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
