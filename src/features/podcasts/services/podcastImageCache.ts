import {
  readPodcastImageCacheEntry,
  writePodcastImageFile,
  writePodcastImageCacheEntry,
} from '../../../core/storage/noteboxStorage';
import {PodcastImageCacheEntry} from '../../../types';
import {fetchRssArtworkUrl} from './rssArtwork';

export const PODCAST_IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ARTWORK_DOWNLOAD_TIMEOUT_MS = 10000;
const inFlightArtworkRequests = new Map<string, Promise<string | null>>();

function isEntryFresh(entry: PodcastImageCacheEntry): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAt)) {
    return false;
  }

  return Date.now() - fetchedAt < PODCAST_IMAGE_CACHE_TTL_MS;
}

function getRenderableArtworkUri(entry: PodcastImageCacheEntry | null): string | null {
  if (!entry) {
    return null;
  }

  const localImageUri = entry.localImageUri?.trim();
  if (localImageUri) {
    return localImageUri;
  }

  const remoteImageUrl = entry.imageUrl?.trim();
  return remoteImageUrl || null;
}

function getImageExtension(mimeType: string | null, imageUrl: string): string {
  const normalizedMimeType = mimeType?.split(';')[0].trim().toLowerCase() ?? '';
  switch (normalizedMimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      break;
  }

  const urlWithoutQuery = imageUrl.split(/[?#]/, 1)[0];
  const extensionMatch = /\.([a-zA-Z0-9]+)$/.exec(urlWithoutQuery);
  const normalizedExtension = extensionMatch?.[1]?.toLowerCase();
  if (normalizedExtension) {
    return normalizedExtension;
  }

  return 'img';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bufferCtor = (globalThis as {Buffer?: {from: (input: ArrayBuffer) => {toString: (encoding: string) => string}}}).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(buffer).toString('base64');
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  const btoaEncoder = (globalThis as {btoa?: (input: string) => string}).btoa;
  if (typeof btoaEncoder === 'function') {
    return btoaEncoder(binary);
  }

  throw new Error('No base64 encoder available in current runtime.');
}

async function downloadArtwork(
  imageUrl: string,
): Promise<{base64Data: string; extension: string; mimeType: string} | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, ARTWORK_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      return null;
    }

    const mimeType = response.headers.get('content-type')?.trim() || 'image/*';
    const extension = getImageExtension(mimeType, imageUrl);

    return {
      base64Data: arrayBufferToBase64(buffer),
      extension,
      mimeType,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function getPodcastImageCacheKey(rssFeedUrl: string): string {
  const normalized = rssFeedUrl.trim().toLowerCase();
  let hash = 5381;
  const maxPrime = 4_294_967_291;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33 + normalized.charCodeAt(index)) % maxPrime;
  }

  return `rss-${Math.floor(hash).toString(16)}`;
}

export async function getCachedPodcastArtworkUri(
  baseUri: string,
  rssFeedUrl: string,
): Promise<string | null> {
  const normalizedRssFeedUrl = rssFeedUrl.trim();
  if (!baseUri || !normalizedRssFeedUrl) {
    return null;
  }

  const cacheKey = getPodcastImageCacheKey(normalizedRssFeedUrl);
  const cachedEntry = await readPodcastImageCacheEntry(baseUri, cacheKey);
  if (!cachedEntry || !isEntryFresh(cachedEntry)) {
    return null;
  }

  return getRenderableArtworkUri(cachedEntry);
}

export async function getPodcastArtworkUri(
  baseUri: string,
  rssFeedUrl: string,
): Promise<string | null> {
  const normalizedRssFeedUrl = rssFeedUrl.trim();
  if (!baseUri || !normalizedRssFeedUrl) {
    return null;
  }

  const cacheKey = getPodcastImageCacheKey(normalizedRssFeedUrl);
  const activeRequest = inFlightArtworkRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = (async () => {
    const cachedEntry = await readPodcastImageCacheEntry(baseUri, cacheKey);
    if (cachedEntry && isEntryFresh(cachedEntry)) {
      return getRenderableArtworkUri(cachedEntry);
    }

    const imageUrl = await fetchRssArtworkUrl(normalizedRssFeedUrl);
    if (!imageUrl) {
      return getRenderableArtworkUri(cachedEntry);
    }

    const downloadedImage = await downloadArtwork(imageUrl);
    const fetchedAt = new Date().toISOString();
    if (downloadedImage) {
      const localImageUri = await writePodcastImageFile(
        baseUri,
        cacheKey,
        downloadedImage.base64Data,
        downloadedImage.extension,
        downloadedImage.mimeType,
      );
      await writePodcastImageCacheEntry(baseUri, cacheKey, {
        fetchedAt,
        imageUrl,
        localImageUri,
        mimeType: downloadedImage.mimeType,
      });
      return localImageUri;
    }

    await writePodcastImageCacheEntry(baseUri, cacheKey, {
      fetchedAt,
      imageUrl,
    });
    return imageUrl;
  })();

  inFlightArtworkRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlightArtworkRequests.delete(cacheKey);
  }
}

export function warmPodcastArtworkCache(
  baseUri: string,
  rssFeedUrl: string,
): void {
  getPodcastArtworkUri(baseUri, rssFeedUrl).catch(() => undefined);
}
