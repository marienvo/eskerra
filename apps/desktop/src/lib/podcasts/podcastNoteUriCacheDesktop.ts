import {normalizeSeriesKey} from './rssParser';

const podcastNoteUriBySeriesName = new Map<string, string>();
const podcastNoteUriByNormalizedSeriesName = new Map<string, string>();

function getSeriesCacheKey(baseUri: string, seriesName: string): string {
  return `${baseUri}::${seriesName}`;
}

function getNormalizedSeriesCacheKey(baseUri: string, seriesName: string): string | null {
  const normalizedSeriesName = normalizeSeriesKey(seriesName);
  if (!normalizedSeriesName) {
    return null;
  }
  return `${baseUri}::${normalizedSeriesName}`;
}

/** Remove all in-memory podcast note URI entries for this vault (session-only cache). */
export function clearPodcastNoteUriCacheForVault(baseUri: string): void {
  const prefix = `${baseUri}::`;
  for (const key of [...podcastNoteUriBySeriesName.keys()]) {
    if (key.startsWith(prefix)) {
      podcastNoteUriBySeriesName.delete(key);
    }
  }
  for (const key of [...podcastNoteUriByNormalizedSeriesName.keys()]) {
    if (key.startsWith(prefix)) {
      podcastNoteUriByNormalizedSeriesName.delete(key);
    }
  }
}

export function persistPodcastNoteUri(
  baseUri: string,
  seriesTitle: string,
  noteUri: string,
): void {
  const trimmed = noteUri.trim();
  if (!trimmed) {
    return;
  }
  podcastNoteUriBySeriesName.set(getSeriesCacheKey(baseUri, seriesTitle), trimmed);
  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesTitle);
  if (normalizedKey) {
    podcastNoteUriByNormalizedSeriesName.set(normalizedKey, trimmed);
  }
}

export function resolveCachedPodcastNoteUri(
  baseUri: string,
  seriesName: string,
): string | undefined {
  const direct = podcastNoteUriBySeriesName.get(getSeriesCacheKey(baseUri, seriesName));
  if (direct) {
    return direct;
  }
  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (!normalizedKey) {
    return undefined;
  }
  return podcastNoteUriByNormalizedSeriesName.get(normalizedKey);
}
