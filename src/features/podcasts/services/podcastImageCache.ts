import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readPodcastImageCacheEntry,
  writePodcastImageFile,
  writePodcastImageCacheEntry,
} from '../../../core/storage/noteboxStorage';
import {PodcastImageCacheEntry} from '../../../types';
import {fetchRssArtworkUrl} from './rssArtwork';

export const PODCAST_IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PODCAST_IMAGE_REMOTE_FALLBACK_TTL_MS = 60 * 60 * 1000;
const ARTWORK_DOWNLOAD_TIMEOUT_MS = 10000;
const inFlightArtworkRequests = new Map<string, Promise<string | null>>();
const artworkUriMemoryCache = new Map<string, string | null>();
const persistentArtworkWriteChains = new Map<string, Promise<void>>();
const PERSISTENT_ARTWORK_CACHE_KEY_PREFIX = 'notebox:artworkUriCache:';

function getArtworkMemoryCacheKey(baseUri: string, rssFeedUrl: string): string {
  return `${baseUri}::${getPodcastImageCacheKey(rssFeedUrl)}`;
}

function getPersistentArtworkCacheStorageKey(baseUri: string): string {
  return `${PERSISTENT_ARTWORK_CACHE_KEY_PREFIX}${baseUri}`;
}

function getPersistentArtworkEntries(baseUri: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const basePrefix = `${baseUri}::`;

  for (const [cacheKey, uri] of artworkUriMemoryCache.entries()) {
    if (!cacheKey.startsWith(basePrefix)) {
      continue;
    }
    if (typeof uri !== 'string') {
      continue;
    }
    const normalizedUri = uri.trim();
    if (!normalizedUri) {
      continue;
    }
    entries[cacheKey] = normalizedUri;
  }

  return entries;
}

async function persistArtworkUriCache(baseUri: string): Promise<void> {
  if (!baseUri) {
    return;
  }

  const storageKey = getPersistentArtworkCacheStorageKey(baseUri);
  const entries = getPersistentArtworkEntries(baseUri);
  if (Object.keys(entries).length === 0) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(entries));
}

function schedulePersistArtworkUriCache(baseUri: string): void {
  const previousWrite = persistentArtworkWriteChains.get(baseUri) ?? Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await persistArtworkUriCache(baseUri);
    });

  persistentArtworkWriteChains.set(baseUri, nextWrite);
  nextWrite
    .catch(() => undefined)
    .finally(() => {
      if (persistentArtworkWriteChains.get(baseUri) === nextWrite) {
        persistentArtworkWriteChains.delete(baseUri);
      }
    });
}

function setArtworkUriCacheValue(
  baseUri: string,
  normalizedRssFeedUrl: string,
  uri: string | null,
): void {
  const memoryCacheKey = getArtworkMemoryCacheKey(baseUri, normalizedRssFeedUrl);
  artworkUriMemoryCache.set(memoryCacheKey, uri);
  schedulePersistArtworkUriCache(baseUri);
}

function isRenderableUri(uri: string): boolean {
  if (!uri.startsWith('content://')) {
    // http/https and file:// URIs are always renderable.
    return true;
  }
  // SAF tree-path URIs (content://…/tree/… without /document/) cannot be opened
  // by React Native Image's Glide loader. Only proper document URIs work.
  return uri.includes('/document/');
}

function isEntryFresh(entry: PodcastImageCacheEntry): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAt)) {
    return false;
  }

  const localImageUri = entry.localImageUri?.trim();
  if (!localImageUri) {
    return Date.now() - fetchedAt < PODCAST_IMAGE_REMOTE_FALLBACK_TTL_MS;
  }

  // Entries whose localImageUri uses the old path-style SAF tree URI (no /document/)
  // are treated as stale so they get re-downloaded and stored with the correct
  // document URI format returned by stat() in writePodcastImageFile.
  if (!isRenderableUri(localImageUri)) {
    return false;
  }

  return Date.now() - fetchedAt < PODCAST_IMAGE_CACHE_TTL_MS;
}

function getRenderableArtworkUri(entry: PodcastImageCacheEntry | null): string | null {
  if (!entry) {
    return null;
  }

  const localImageUri = entry.localImageUri?.trim();
  if (localImageUri && isRenderableUri(localImageUri)) {
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

/**
 * Synchronous read of a non-empty artwork URI already in the in-memory cache.
 * Used for first paint without waiting on async SAF reads. Ignores stored null
 * (negative-cache) so callers can fall through to disk/network resolution.
 */
export function peekCachedPodcastArtworkUriFromMemory(
  baseUri: string,
  rssFeedUrl: string,
): string | null {
  const normalizedRssFeedUrl = rssFeedUrl.trim();
  if (!baseUri || !normalizedRssFeedUrl) {
    return null;
  }

  const memoryCacheKey = getArtworkMemoryCacheKey(baseUri, normalizedRssFeedUrl);
  const cached = artworkUriMemoryCache.get(memoryCacheKey);
  if (typeof cached !== 'string') {
    return null;
  }

  const trimmed = cached.trim();
  return trimmed || null;
}

export async function getCachedPodcastArtworkUri(
  baseUri: string,
  rssFeedUrl: string,
): Promise<string | null> {
  const normalizedRssFeedUrl = rssFeedUrl.trim();
  if (!baseUri || !normalizedRssFeedUrl) {
    return null;
  }

  const memoryCacheKey = getArtworkMemoryCacheKey(baseUri, normalizedRssFeedUrl);
  const memoryHit = peekCachedPodcastArtworkUriFromMemory(baseUri, normalizedRssFeedUrl);
  if (memoryHit) {
    return memoryHit;
  }

  const cacheKey = getPodcastImageCacheKey(normalizedRssFeedUrl);
  const cachedEntry = await readPodcastImageCacheEntry(baseUri, cacheKey);
  if (!cachedEntry || !isEntryFresh(cachedEntry)) {
    artworkUriMemoryCache.delete(memoryCacheKey);
    return null;
  }

  const renderableUri = getRenderableArtworkUri(cachedEntry);
  setArtworkUriCacheValue(baseUri, normalizedRssFeedUrl, renderableUri);
  return renderableUri;
}

export async function getPodcastArtworkUri(
  baseUri: string,
  rssFeedUrl: string,
): Promise<string | null> {
  const normalizedRssFeedUrl = rssFeedUrl.trim();
  if (!baseUri || !normalizedRssFeedUrl) {
    return null;
  }

  const memoryHit = peekCachedPodcastArtworkUriFromMemory(baseUri, normalizedRssFeedUrl);
  if (memoryHit) {
    return memoryHit;
  }

  const cacheKey = getPodcastImageCacheKey(normalizedRssFeedUrl);
  const activeRequest = inFlightArtworkRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = (async () => {
    const cachedEntry = await readPodcastImageCacheEntry(baseUri, cacheKey);
    if (cachedEntry && isEntryFresh(cachedEntry)) {
      const cachedUri = getRenderableArtworkUri(cachedEntry);
      setArtworkUriCacheValue(baseUri, normalizedRssFeedUrl, cachedUri);
      return cachedUri;
    }

    const imageUrl = await fetchRssArtworkUrl(normalizedRssFeedUrl);
    if (!imageUrl) {
      const fallbackUri = getRenderableArtworkUri(cachedEntry);
      setArtworkUriCacheValue(baseUri, normalizedRssFeedUrl, fallbackUri);
      return fallbackUri;
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
      setArtworkUriCacheValue(baseUri, normalizedRssFeedUrl, localImageUri);
      return localImageUri;
    }

    await writePodcastImageCacheEntry(baseUri, cacheKey, {
      fetchedAt,
      imageUrl,
    });
    setArtworkUriCacheValue(baseUri, normalizedRssFeedUrl, imageUrl);
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

export async function loadPersistentArtworkUriCache(baseUri: string): Promise<void> {
  if (!baseUri) {
    return;
  }

  const storageKey = getPersistentArtworkCacheStorageKey(baseUri);
  const rawCache = await AsyncStorage.getItem(storageKey);
  if (!rawCache?.trim()) {
    return;
  }

  let parsedCache: Record<string, unknown>;
  try {
    parsedCache = JSON.parse(rawCache) as Record<string, unknown>;
  } catch {
    return;
  }

  for (const [cacheKey, cacheValue] of Object.entries(parsedCache)) {
    if (typeof cacheValue !== 'string') {
      continue;
    }

    const normalizedValue = cacheValue.trim();
    if (!normalizedValue) {
      continue;
    }
    if (!artworkUriMemoryCache.has(cacheKey)) {
      artworkUriMemoryCache.set(cacheKey, normalizedValue);
    }
  }
}

export async function primeArtworkCacheFromDisk(
  baseUri: string,
  rssFeedUrls: string[],
): Promise<void> {
  const uniqueFeedUrls = Array.from(
    new Set(rssFeedUrls.map(feedUrl => feedUrl.trim()).filter(Boolean)),
  );
  await Promise.all(uniqueFeedUrls.map(feedUrl => getCachedPodcastArtworkUri(baseUri, feedUrl)));
}
