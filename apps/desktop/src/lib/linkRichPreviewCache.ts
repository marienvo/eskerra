import {invoke, isTauri} from '@tauri-apps/api/core';

export type LinkRichMetadata = {
  title: string | null;
  siteName: string | null;
  description: string | null;
  imageCandidates: string[];
  finalUrl: string;
};

export type LinkRichCacheEntry =
  | {
      status: 'ok';
      metadata: LinkRichMetadata;
      fetchedAt: number;
      expiresAt: number;
    }
  | {
      status: 'error';
      message: string;
      fetchedAt: number;
      expiresAt: number;
    };

const DB_NAME = 'eskerra-link-rich';
const STORE_NAME = 'previews';
const DB_VERSION = 1;
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ERROR_TTL_MS = 60 * 60 * 1000; // 1 hour

const memory = new Map<string, LinkRichCacheEntry>();
const inflight = new Map<string, Promise<LinkRichCacheEntry>>();
const subscribers = new Set<() => void>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<LinkRichCacheEntry | null> {
  const db = await openDb();
  if (!db) {
    return null;
  }
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as LinkRichCacheEntry | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(key: string, value: LinkRichCacheEntry): Promise<void> {
  const db = await openDb();
  if (!db) {
    return;
  }
  await new Promise<void>(resolve => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

function notifySubscribers(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* isolate subscriber failures */
    }
  }
}

export function subscribeLinkRichPreviewUpdates(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getCachedLinkRichEntry(url: string): LinkRichCacheEntry | null {
  const entry = memory.get(url);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry;
}

function isFresh(entry: LinkRichCacheEntry): boolean {
  return entry.expiresAt > Date.now();
}

async function runFetch(url: string): Promise<LinkRichCacheEntry> {
  const now = Date.now();
  if (!isTauri()) {
    const entry: LinkRichCacheEntry = {
      status: 'error',
      message: 'Link previews require the Tauri runtime',
      fetchedAt: now,
      expiresAt: now + ERROR_TTL_MS,
    };
    memory.set(url, entry);
    notifySubscribers();
    return entry;
  }
  try {
    const metadata = await invoke<LinkRichMetadata>('fetch_link_rich_metadata', {url});
    const entry: LinkRichCacheEntry = {
      status: 'ok',
      metadata,
      fetchedAt: now,
      expiresAt: now + OK_TTL_MS,
    };
    memory.set(url, entry);
    await idbPut(url, entry);
    notifySubscribers();
    return entry;
  } catch (err) {
    const entry: LinkRichCacheEntry = {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      fetchedAt: now,
      expiresAt: now + ERROR_TTL_MS,
    };
    memory.set(url, entry);
    await idbPut(url, entry);
    notifySubscribers();
    return entry;
  }
}

/**
 * Returns a cached entry immediately when fresh; otherwise schedules a background fetch. The
 * returned promise resolves with the (possibly fresh) entry once the fetch completes. Concurrent
 * calls for the same URL share the same in-flight fetch.
 */
export async function ensureLinkRichPreview(url: string): Promise<LinkRichCacheEntry> {
  const cached = memory.get(url);
  if (cached && isFresh(cached)) {
    return cached;
  }
  const diskEntry = cached ?? (await idbGet(url));
  if (diskEntry) {
    memory.set(url, diskEntry);
    if (isFresh(diskEntry)) {
      notifySubscribers();
      return diskEntry;
    }
  }
  const existing = inflight.get(url);
  if (existing) {
    return existing;
  }
  const p = runFetch(url).finally(() => {
    inflight.delete(url);
  });
  inflight.set(url, p);
  return p;
}

/** Fire-and-forget wrapper for rendering code that doesn't need to await the result. */
export function prefetchLinkRichPreview(url: string): void {
  void ensureLinkRichPreview(url).catch(() => {
    /* entry already recorded as error */
  });
}
