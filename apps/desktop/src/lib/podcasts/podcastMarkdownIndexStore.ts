import {load} from '@tauri-apps/plugin-store';

import type {RootMarkdownFile} from './podcastTypes';

const STORE_PATH = 'notebox-desktop.json';
const PAYLOAD_VERSION = 1;

type PersistedPayload = {
  entries: RootMarkdownFile[];
  snapshottedAt: string;
  v: typeof PAYLOAD_VERSION;
};

function keyForVault(baseUri: string): string {
  return `podcastMarkdownIndex:${encodeURIComponent(baseUri.trim())}`;
}

export async function loadPersistedPodcastMarkdownIndex(
  baseUri: string,
): Promise<RootMarkdownFile[] | null> {
  if (!baseUri.trim()) {
    return null;
  }
  const store = await load(STORE_PATH);
  const raw = await store.get<string>(keyForVault(baseUri));
  if (!raw?.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('v' in parsed) ||
    (parsed as PersistedPayload).v !== PAYLOAD_VERSION ||
    !Array.isArray((parsed as PersistedPayload).entries)
  ) {
    return null;
  }
  return (parsed as PersistedPayload).entries;
}

export async function savePersistedPodcastMarkdownIndex(
  baseUri: string,
  entries: RootMarkdownFile[],
): Promise<void> {
  if (!baseUri.trim()) {
    return;
  }
  const store = await load(STORE_PATH);
  const payload: PersistedPayload = {
    entries,
    snapshottedAt: new Date().toISOString(),
    v: PAYLOAD_VERSION,
  };
  await store.set(keyForVault(baseUri), JSON.stringify(payload));
  await store.save();
}
