import AsyncStorage from '@react-native-async-storage/async-storage';

import {DEV_MOCK_VAULT_URI} from '../../dev/mockVaultData';
import {PodcastImageCacheEntry} from '../../types';
import {
  podcastArtworkFileUriExistsNative,
  writePodcastArtworkFileNative,
} from './androidPodcastArtworkCache';

const PODCAST_IMAGE_META_PREFIX = 'notebox:podcastImageMeta:';

const DEV_PODCAST_IMAGE_META_PREFIX = '@notebox_dev:podcastImageMeta:';
const DEV_PODCAST_FILE_PAYLOAD_PREFIX = '@notebox_dev:podcastArtworkPayload:';
const DEV_FILE_URI_PREFIX = 'file:///notebox-dev-podcast/';

type PodcastImageMetaBlob = {
  v: number;
  byKey: Record<string, PodcastImageCacheEntry>;
};

const isDevMockVaultEnabled =
  __DEV__ &&
  !(globalThis as {process?: {env?: Record<string, string | undefined>}}).process
    ?.env?.JEST_WORKER_ID;

function assertDevMockVaultUri(baseUri: string): void {
  const normalized = baseUri.trim();
  if (!normalized) {
    throw new Error('Base URI cannot be empty.');
  }
  if (normalized !== DEV_MOCK_VAULT_URI) {
    throw new Error('Invalid dev mock vault URI.');
  }
}

function normalizeBaseUri(baseUri: string): string {
  const normalizedUri = baseUri.trim();
  if (!normalizedUri) {
    throw new Error('Base URI cannot be empty.');
  }
  return normalizedUri;
}

function isValidPodcastImageCacheEntry(
  value: unknown,
): value is PodcastImageCacheEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<PodcastImageCacheEntry>;
  const hasValidOptionalUri =
    entry.localImageUri === undefined || typeof entry.localImageUri === 'string';
  const hasValidOptionalMime =
    entry.mimeType === undefined || typeof entry.mimeType === 'string';

  return (
    typeof entry.fetchedAt === 'string' &&
    typeof entry.imageUrl === 'string' &&
    hasValidOptionalUri &&
    hasValidOptionalMime
  );
}

function getMetaStorageKey(baseUri: string): string {
  const normalized = normalizeBaseUri(baseUri);
  if (isDevMockVaultEnabled) {
    assertDevMockVaultUri(normalized);
    return `${DEV_PODCAST_IMAGE_META_PREFIX}${normalized}`;
  }
  return `${PODCAST_IMAGE_META_PREFIX}${normalized}`;
}

function isValidMetaBlob(parsed: unknown): parsed is PodcastImageMetaBlob {
  if (typeof parsed !== 'object' || parsed === null) {
    return false;
  }
  const o = parsed as Partial<PodcastImageMetaBlob>;
  if (o.v !== 1 || typeof o.byKey !== 'object' || o.byKey === null) {
    return false;
  }
  for (const entry of Object.values(o.byKey)) {
    if (!isValidPodcastImageCacheEntry(entry)) {
      return false;
    }
  }
  return true;
}

async function readMetaByKey(baseUri: string): Promise<Record<string, PodcastImageCacheEntry>> {
  const raw = await AsyncStorage.getItem(getMetaStorageKey(baseUri));
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidMetaBlob(parsed)) {
      return {};
    }
    return parsed.byKey;
  } catch {
    return {};
  }
}

async function writeMetaByKey(
  baseUri: string,
  byKey: Record<string, PodcastImageCacheEntry>,
): Promise<void> {
  const key = getMetaStorageKey(baseUri);
  if (Object.keys(byKey).length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  const blob: PodcastImageMetaBlob = {v: 1, byKey};
  await AsyncStorage.setItem(key, JSON.stringify(blob));
}

function devPayloadKey(baseUri: string, cacheKey: string, extension: string): string {
  const normalizedExt = extension.trim().toLowerCase().replace(/^\./, '');
  return `${DEV_PODCAST_FILE_PAYLOAD_PREFIX}${normalizeBaseUri(baseUri)}::${cacheKey.trim()}::${normalizedExt}`;
}

function buildDevPodcastFileUri(baseUri: string, cacheKey: string, extension: string): string {
  const normalizedExt = extension.trim().toLowerCase().replace(/^\./, '');
  return `${DEV_FILE_URI_PREFIX}${encodeURIComponent(
    normalizeBaseUri(baseUri),
  )}/${cacheKey.trim()}.${normalizedExt}`;
}

function parseDevPodcastFileUri(
  uri: string,
): {baseUri: string; cacheKey: string; extension: string} | null {
  const trimmed = uri.trim();
  if (!trimmed.startsWith(DEV_FILE_URI_PREFIX)) {
    return null;
  }
  const rest = trimmed.slice(DEV_FILE_URI_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 0) {
    return null;
  }
  let baseUriDecoded: string;
  try {
    baseUriDecoded = decodeURIComponent(rest.slice(0, slashIdx));
  } catch {
    return null;
  }
  const filePart = rest.slice(slashIdx + 1);
  const dotIdx = filePart.lastIndexOf('.');
  if (dotIdx < 0) {
    return null;
  }
  const cacheKey = filePart.slice(0, dotIdx);
  const extension = filePart.slice(dotIdx + 1);
  if (!cacheKey || !extension) {
    return null;
  }
  return {baseUri: baseUriDecoded, cacheKey, extension};
}

export async function readPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<PodcastImageCacheEntry | null> {
  const normalizedKey = cacheKey.trim();
  if (!normalizedKey) {
    throw new Error('Cache key cannot be empty.');
  }

  if (isDevMockVaultEnabled) {
    assertDevMockVaultUri(baseUri);
  }

  const byKey = await readMetaByKey(baseUri);
  return byKey[normalizedKey] ?? null;
}

export async function writePodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
  entry: PodcastImageCacheEntry,
): Promise<void> {
  const normalizedKey = cacheKey.trim();
  if (!normalizedKey) {
    throw new Error('Cache key cannot be empty.');
  }

  if (isDevMockVaultEnabled) {
    assertDevMockVaultUri(baseUri);
  }

  const byKey = await readMetaByKey(baseUri);
  byKey[normalizedKey] = entry;
  await writeMetaByKey(baseUri, byKey);
}

export async function clearPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<void> {
  const normalizedKey = cacheKey.trim();
  if (!normalizedKey) {
    return;
  }

  if (isDevMockVaultEnabled) {
    assertDevMockVaultUri(baseUri);
  }

  const byKey = await readMetaByKey(baseUri);
  const existing = byKey[normalizedKey];
  delete byKey[normalizedKey];
  await writeMetaByKey(baseUri, byKey);

  if (isDevMockVaultEnabled && existing?.localImageUri?.trim().startsWith(DEV_FILE_URI_PREFIX)) {
    const parsed = parseDevPodcastFileUri(existing.localImageUri.trim());
    if (parsed) {
      await AsyncStorage.removeItem(
        devPayloadKey(parsed.baseUri, parsed.cacheKey, parsed.extension),
      );
    }
  }
}

/**
 * Writes downloaded artwork bytes to app-internal storage and returns a file:// URI.
 */
export async function writePodcastArtworkImageFile(
  baseUri: string,
  cacheKey: string,
  base64Data: string,
  extension: string,
  _mimeType: string,
): Promise<string> {
  const normalizedCacheKey = cacheKey.trim();
  const normalizedExtension = extension.trim().toLowerCase().replace(/^\./, '');
  const normalizedPayload = base64Data.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }
  if (!normalizedExtension) {
    throw new Error('Image extension cannot be empty.');
  }
  if (!normalizedPayload) {
    throw new Error('Image payload cannot be empty.');
  }

  if (isDevMockVaultEnabled) {
    assertDevMockVaultUri(baseUri);
    const uri = buildDevPodcastFileUri(baseUri, normalizedCacheKey, normalizedExtension);
    await AsyncStorage.setItem(
      devPayloadKey(baseUri, normalizedCacheKey, normalizedExtension),
      normalizedPayload,
    );
    return uri;
  }

  return writePodcastArtworkFileNative(
    baseUri,
    normalizedCacheKey,
    normalizedExtension,
    normalizedPayload,
  );
}

/**
 * Returns whether local artwork files still exist (internal file:// or dev mock file://).
 */
export async function podcastArtworkFileUriExists(fileUri: string): Promise<boolean> {
  const trimmed = fileUri.trim();
  if (!trimmed.startsWith('file://')) {
    return false;
  }

  const devParsed = parseDevPodcastFileUri(trimmed);
  if (devParsed) {
    const payload = await AsyncStorage.getItem(
      devPayloadKey(devParsed.baseUri, devParsed.cacheKey, devParsed.extension),
    );
    return Boolean(payload?.trim());
  }

  return podcastArtworkFileUriExistsNative(trimmed);
}
