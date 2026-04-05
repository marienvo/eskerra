import {load} from '@tauri-apps/plugin-store';

import {normalizeSeriesKey} from './rssParser';

const STORE_PATH = 'eskerra-desktop.json';

const rssFeedUrlBySeriesName = new Map<string, string>();
const rssFeedUrlByNormalizedSeriesName = new Map<string, string>();

const PERSISTED_PAYLOAD_VERSION = 1;

type PersistedRssPayload = {
  v: typeof PERSISTED_PAYLOAD_VERSION;
  bySeries: Record<string, string>;
  byNormalized: Record<string, string>;
};

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

function storeKeyForVault(baseUri: string): string {
  return `rssFeedUrl:${encodeURIComponent(baseUri.trim())}`;
}

export async function hydrateRssFeedUrlCacheFromStore(baseUri: string): Promise<void> {
  rssFeedUrlBySeriesName.clear();
  rssFeedUrlByNormalizedSeriesName.clear();
  if (!baseUri.trim()) {
    return;
  }

  const store = await load(STORE_PATH);
  const raw = await store.get<string>(storeKeyForVault(baseUri));
  if (!raw?.trim()) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('v' in parsed) ||
    (parsed as PersistedRssPayload).v !== PERSISTED_PAYLOAD_VERSION
  ) {
    return;
  }

  const payload = parsed as PersistedRssPayload;
  const prefix = `${baseUri}::`;

  for (const [seriesName, url] of Object.entries(payload.bySeries)) {
    if (typeof url !== 'string') {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    rssFeedUrlBySeriesName.set(`${prefix}${seriesName}`, trimmed);
  }

  for (const [normalizedKey, url] of Object.entries(payload.byNormalized)) {
    if (typeof url !== 'string') {
      continue;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    rssFeedUrlByNormalizedSeriesName.set(`${prefix}${normalizedKey}`, trimmed);
  }
}

async function persistRssFeedUrlCacheToStore(baseUri: string): Promise<void> {
  const prefix = `${baseUri}::`;
  const bySeries: Record<string, string> = {};
  const byNormalized: Record<string, string> = {};

  for (const [key, url] of rssFeedUrlBySeriesName) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const seriesName = key.slice(prefix.length);
    const trimmed = url.trim();
    if (trimmed) {
      bySeries[seriesName] = trimmed;
    }
  }

  for (const [key, url] of rssFeedUrlByNormalizedSeriesName) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const normalizedKey = key.slice(prefix.length);
    const trimmed = url.trim();
    if (trimmed) {
      byNormalized[normalizedKey] = trimmed;
    }
  }

  const store = await load(STORE_PATH);
  if (Object.keys(bySeries).length === 0 && Object.keys(byNormalized).length === 0) {
    await store.delete(storeKeyForVault(baseUri));
  } else {
    const payload: PersistedRssPayload = {
      v: PERSISTED_PAYLOAD_VERSION,
      byNormalized,
      bySeries,
    };
    await store.set(storeKeyForVault(baseUri), JSON.stringify(payload));
  }
  await store.save();
}

let persistChain = Promise.resolve();

function schedulePersist(baseUri: string): void {
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => persistRssFeedUrlCacheToStore(baseUri));
}

export function persistRssFeedUrl(baseUri: string, seriesName: string, rssFeedUrl: string): void {
  const trimmed = rssFeedUrl.trim();
  if (!trimmed) {
    return;
  }
  rssFeedUrlBySeriesName.set(getSeriesCacheKey(baseUri, seriesName), trimmed);
  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (normalizedKey) {
    rssFeedUrlByNormalizedSeriesName.set(normalizedKey, trimmed);
  }
  schedulePersist(baseUri);
}

export function resolveCachedRssFeedUrl(baseUri: string, seriesName: string): string | undefined {
  const direct = rssFeedUrlBySeriesName.get(getSeriesCacheKey(baseUri, seriesName));
  if (direct) {
    return direct;
  }
  const normalizedKey = getNormalizedSeriesCacheKey(baseUri, seriesName);
  if (!normalizedKey) {
    return undefined;
  }
  return rssFeedUrlByNormalizedSeriesName.get(normalizedKey);
}
