import AsyncStorage from '@react-native-async-storage/async-storage';

import {RootMarkdownFile} from '../../../types';
import {isPodcastFile} from './podcastParser';

const STORAGE_KEY_PREFIX = 'eskerra:generalPodcastMarkdownIndex:';

const PAYLOAD_VERSION = 1;

type PersistedPayload = {
  entries: RootMarkdownFile[];
  snapshottedAt: string;
  v: typeof PAYLOAD_VERSION;
};

function getStorageKey(baseUri: string): string {
  return `${STORAGE_KEY_PREFIX}${baseUri}`;
}

function isRssPodcastMarkdownFile(fileName: string): boolean {
  const trimmed = fileName.trim();
  if (!trimmed.startsWith('📻')) {
    return false;
  }
  const tail = trimmed.slice(2).trim();
  return tail.length > 3 && tail.toLowerCase().endsWith('.md');
}

export function filterPodcastRelevantGeneralMarkdownFiles(
  files: RootMarkdownFile[],
): RootMarkdownFile[] {
  return files.filter(
    file => isPodcastFile(file.name) || isRssPodcastMarkdownFile(file.name),
  );
}

export function podcastMarkdownIndexSignature(entries: RootMarkdownFile[]): string {
  return entries
    .map(entry => `${entry.uri}|${entry.lastModified ?? 'null'}|${entry.name}`)
    .sort()
    .join('\n');
}

export function splitPodcastAndRssMarkdownFiles(relevant: RootMarkdownFile[]): {
  podcastFiles: RootMarkdownFile[];
  rssFeedFiles: RootMarkdownFile[];
} {
  return {
    podcastFiles: relevant.filter(file => isPodcastFile(file.name)),
    rssFeedFiles: relevant.filter(file => isRssPodcastMarkdownFile(file.name)),
  };
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRootMarkdownFile(value: unknown): value is RootMarkdownFile {
  if (!isPlainObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.name === 'string' &&
    typeof value.uri === 'string' &&
    (value.lastModified === null || typeof value.lastModified === 'number')
  );
}

function isValidPayload(parsed: unknown): parsed is PersistedPayload {
  if (!isPlainObjectRecord(parsed)) {
    return false;
  }
  if (parsed.v !== PAYLOAD_VERSION) {
    return false;
  }
  if (typeof parsed.snapshottedAt !== 'string') {
    return false;
  }
  if (!Array.isArray(parsed.entries)) {
    return false;
  }
  return parsed.entries.every(isValidRootMarkdownFile);
}

export async function loadPersistedPodcastMarkdownIndex(
  baseUri: string,
): Promise<RootMarkdownFile[] | null> {
  if (!baseUri) {
    return null;
  }

  const raw = await AsyncStorage.getItem(getStorageKey(baseUri));
  if (!raw?.trim()) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isValidPayload(parsed)) {
    return null;
  }

  return parsed.entries;
}

export async function savePersistedPodcastMarkdownIndex(
  baseUri: string,
  entries: RootMarkdownFile[],
): Promise<void> {
  if (!baseUri) {
    return;
  }

  const payload: PersistedPayload = {
    entries,
    snapshottedAt: new Date().toISOString(),
    v: PAYLOAD_VERSION,
  };

  await AsyncStorage.setItem(getStorageKey(baseUri), JSON.stringify(payload));
}

/**
 * Clears persisted index for tests.
 */
export async function clearPersistedPodcastMarkdownIndexForTesting(
  baseUri: string,
): Promise<void> {
  await AsyncStorage.removeItem(getStorageKey(baseUri));
}
