import {fetchRssArtworkUrl} from '@eskerra/core';

const STORAGE_KEY = 'eskerra.desktop.artworkCache.v1';
/** Reuse resolved artwork URL for a week. */
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Negative cache (no artwork in feed) for 6 hours. */
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

export type ArtworkCacheEntry = {
  url: string | null;
  fetchedAt: number;
};

const memory = new Map<string, ArtworkCacheEntry>();
const pendingFetches = new Map<string, Promise<string | null>>();

/** False until first read/write path calls {@link ensureHydratedFromStorage}. Cleared by {@link clearArtworkCacheForTests}. */
let hydratedFromStorage = false;

function normalizeFeedUrl(rssFeedUrl: string): string {
  return rssFeedUrl.trim();
}

function isStale(entry: ArtworkCacheEntry, now: number): boolean {
  const ttl = entry.url == null ? MISS_TTL_MS : HIT_TTL_MS;
  return now - entry.fetchedAt > ttl;
}

function readStorageObject(): Record<string, ArtworkCacheEntry> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, ArtworkCacheEntry>;
  } catch {
    return {};
  }
}

function persistToStorage(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    const entries = [...memory.entries()].sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
    const trimmed = entries.slice(0, MAX_ENTRIES);
    const obj: Record<string, ArtworkCacheEntry> = {};
    for (const [k, v] of trimmed) {
      obj[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
}

/** Hydrate memory from localStorage (lazy; avoids import-time side effects in tests). */
function hydrateMemoryFromStorage(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const obj = readStorageObject();
  for (const [k, v] of Object.entries(obj)) {
    if (
      v &&
      typeof v.fetchedAt === 'number' &&
      (v.url === null || typeof v.url === 'string')
    ) {
      memory.set(k, v);
    }
  }
}

function ensureHydratedFromStorage(): void {
  if (hydratedFromStorage) {
    return;
  }
  hydrateMemoryFromStorage();
  hydratedFromStorage = true;
}

/**
 * Synchronous peek for first paint.
 * @returns `undefined` if unknown (not cached), `null` if cached miss, URL string if cached hit.
 */
export function peekCachedArtworkUri(rssFeedUrl: string): string | null | undefined {
  ensureHydratedFromStorage();
  const key = normalizeFeedUrl(rssFeedUrl);
  if (!key) {
    return null;
  }
  const now = Date.now();
  const hit = memory.get(key);
  if (!hit) {
    return undefined;
  }
  if (isStale(hit, now)) {
    return undefined;
  }
  return hit.url;
}

export function setArtworkCacheEntryForTests(
  rssFeedUrl: string,
  entry: ArtworkCacheEntry,
): void {
  ensureHydratedFromStorage();
  memory.set(normalizeFeedUrl(rssFeedUrl), entry);
}

export function clearArtworkCacheForTests(): void {
  memory.clear();
  pendingFetches.clear();
  hydratedFromStorage = false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Vitest harness: same as {@link clearArtworkCacheForTests}. */
export function __resetForTests(): void {
  clearArtworkCacheForTests();
}

/**
 * Resolve artwork URL for an RSS feed (network on cache miss). Deduplicates in-flight fetches.
 */
export async function resolveArtworkUri(rssFeedUrl: string): Promise<string | null> {
  ensureHydratedFromStorage();
  const key = normalizeFeedUrl(rssFeedUrl);
  if (!key) {
    return null;
  }

  const now = Date.now();
  const existing = memory.get(key);
  if (existing && !isStale(existing, now)) {
    return existing.url;
  }

  const inflight = pendingFetches.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = (async () => {
    let url: string | null;
    try {
      url = await fetchRssArtworkUrl(key);
    } catch {
      url = null;
    }
    memory.set(key, {url, fetchedAt: Date.now()});
    persistToStorage();
    return url;
  })();

  pendingFetches.set(key, promise);
  try {
    return await promise;
  } finally {
    pendingFetches.delete(key);
  }
}
