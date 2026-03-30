import AsyncStorage from '@react-native-async-storage/async-storage';

import {normalizeSeriesKey} from './rssParser';

const rssFeedUrlBySeriesName = new Map<string, string>();
const rssFeedUrlByNormalizedSeriesName = new Map<string, string>();

const PERSISTENT_RSS_CACHE_KEY_PREFIX = 'notebox:rssFeedUrlBySeries:';
const persistentRssWriteChains = new Map<string, Promise<void>>();

const PERSISTED_PAYLOAD_VERSION = 1;

type PersistedRssPayload = {
  v: typeof PERSISTED_PAYLOAD_VERSION;
  bySeries: Record<string, string>;
  byNormalized: Record<string, string>;
};

export function getSeriesCacheKey(baseUri: string, seriesName: string): string {
  return `${baseUri}::${seriesName}`;
}

function getNormalizedSeriesCacheKey(baseUri: string, seriesName: string): string | null {
  const normalizedSeriesName = normalizeSeriesKey(seriesName);
  if (!normalizedSeriesName) {
    return null;
  }
  return `${baseUri}::${normalizedSeriesName}`;
}

function getPersistentRssCacheStorageKey(baseUri: string): string {
  return `${PERSISTENT_RSS_CACHE_KEY_PREFIX}${baseUri}`;
}

function collectEntriesForBaseUri(baseUri: string): {
  byNormalized: Record<string, string>;
  bySeries: Record<string, string>;
} {
  const prefix = `${baseUri}::`;
  const bySeries: Record<string, string> = {};
  for (const [key, url] of rssFeedUrlBySeriesName) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    bySeries[key.slice(prefix.length)] = trimmed;
  }

  const byNormalized: Record<string, string> = {};
  for (const [key, url] of rssFeedUrlByNormalizedSeriesName) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    byNormalized[key.slice(prefix.length)] = trimmed;
  }

  return {byNormalized, bySeries};
}

async function persistRssFeedUrlCache(baseUri: string): Promise<void> {
  if (!baseUri) {
    return;
  }

  const storageKey = getPersistentRssCacheStorageKey(baseUri);
  const {byNormalized, bySeries} = collectEntriesForBaseUri(baseUri);
  if (Object.keys(bySeries).length === 0 && Object.keys(byNormalized).length === 0) {
    await AsyncStorage.removeItem(storageKey);
    return;
  }

  const payload: PersistedRssPayload = {
    byNormalized,
    bySeries,
    v: PERSISTED_PAYLOAD_VERSION,
  };
  await AsyncStorage.setItem(storageKey, JSON.stringify(payload));
}

function schedulePersistRssFeedUrlCache(baseUri: string): void {
  const previousWrite = persistentRssWriteChains.get(baseUri) ?? Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await persistRssFeedUrlCache(baseUri);
    });

  persistentRssWriteChains.set(baseUri, nextWrite);
  nextWrite
    .catch(() => undefined)
    .finally(() => {
      if (persistentRssWriteChains.get(baseUri) === nextWrite) {
        persistentRssWriteChains.delete(baseUri);
      }
    });
}

export function persistRssFeedUrl(baseUri: string, seriesName: string, rssFeedUrl: string): void {
  rssFeedUrlBySeriesName.set(getSeriesCacheKey(baseUri, seriesName), rssFeedUrl);

  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (normalizedKey) {
    rssFeedUrlByNormalizedSeriesName.set(normalizedKey, rssFeedUrl);
  }

  schedulePersistRssFeedUrlCache(baseUri);
}

export function resolveCachedRssFeedUrl(baseUri: string, seriesName: string): string | undefined {
  const directMatch = rssFeedUrlBySeriesName.get(getSeriesCacheKey(baseUri, seriesName));
  if (directMatch) {
    return directMatch;
  }

  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (!normalizedKey) {
    return undefined;
  }
  return rssFeedUrlByNormalizedSeriesName.get(normalizedKey);
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidPersistedPayload(parsed: unknown): parsed is PersistedRssPayload {
  if (!isPlainObjectRecord(parsed)) {
    return false;
  }
  if (parsed.v !== PERSISTED_PAYLOAD_VERSION) {
    return false;
  }
  if (!isPlainObjectRecord(parsed.bySeries) || !isPlainObjectRecord(parsed.byNormalized)) {
    return false;
  }
  return true;
}

export async function loadPersistentRssFeedUrlCache(baseUri: string): Promise<void> {
  if (!baseUri) {
    return;
  }

  const storageKey = getPersistentRssCacheStorageKey(baseUri);
  const rawCache = await AsyncStorage.getItem(storageKey);
  if (!rawCache?.trim()) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCache) as unknown;
  } catch {
    return;
  }

  if (!isValidPersistedPayload(parsed)) {
    return;
  }

  const prefix = `${baseUri}::`;

  for (const [seriesName, url] of Object.entries(parsed.bySeries)) {
    if (typeof url !== 'string') {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    const fullKey = `${prefix}${seriesName}`;
    if (!rssFeedUrlBySeriesName.has(fullKey)) {
      rssFeedUrlBySeriesName.set(fullKey, trimmed);
    }
  }

  for (const [normalizedKey, url] of Object.entries(parsed.byNormalized)) {
    if (typeof url !== 'string') {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    const fullKey = `${prefix}${normalizedKey}`;
    if (!rssFeedUrlByNormalizedSeriesName.has(fullKey)) {
      rssFeedUrlByNormalizedSeriesName.set(fullKey, trimmed);
    }
  }
}

/**
 * Clears in-memory RSS maps and pending writes. For unit tests only.
 */
export function resetRssFeedUrlCacheForTesting(): void {
  rssFeedUrlBySeriesName.clear();
  rssFeedUrlByNormalizedSeriesName.clear();
  persistentRssWriteChains.clear();
}
