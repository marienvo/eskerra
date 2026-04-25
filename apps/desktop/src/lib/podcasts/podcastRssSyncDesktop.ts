import {
  buildPodcastMarkdownFromRss,
  buildUpdatedPodcastFileContent,
  companionHubFileName,
  mergePodcastsFeedContent,
  parsePodcastRssFetchedAtFromContent,
  parsePodcastRssSettingsFromContent,
  parseUncheckedHubLinks,
  shouldSkipRssFetch,
} from '@eskerra/core';
import type {VaultFilesystem} from '@eskerra/core';

import {splitPodcastAndRssMarkdownFiles, filterPodcastRelevantGeneralMarkdownFiles} from './generalIndex';
import {isPodcastFile} from './podcastParser';
import {listGeneralMarkdownFiles} from './podcastPhase1Desktop';
import type {RootMarkdownFile} from './podcastTypes';

export type DesktopRssSyncResult = {
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
};

// Module-level chain so concurrent calls (e.g. double-click) coalesce into one run.
let syncChain: Promise<DesktopRssSyncResult> | null = null;

export function __resetForTests(): void {
  syncChain = null;
}

function titleFromFileName(name: string): string {
  const noExt = name.replace(/\.md$/i, '');
  // Strip the 📻 prefix (with optional variation selector and trailing whitespace).
  const noPrefix = noExt.replace(/^📻[︎️]?\s*/u, '').trim();
  return noPrefix.length > 0 ? noPrefix : 'Podcast';
}

async function fetchRssXml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {signal: controller.signal});
    if (!res.ok) throw new Error(`RSS fetch failed with HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(handle);
  }
}

async function syncSingleFile(
  uri: string,
  name: string,
  fs: VaultFilesystem,
  now: Date,
): Promise<'synced' | 'skipped' | 'failed'> {
  const content = await fs.readFile(uri, {encoding: 'utf8'});
  const settings = parsePodcastRssSettingsFromContent(content);
  if (settings == null) return 'skipped';

  const lastFetchedAt = parsePodcastRssFetchedAtFromContent(content);
  if (shouldSkipRssFetch(lastFetchedAt, now, settings.minFetchIntervalMinutes)) {
    return 'skipped';
  }

  try {
    const xml = await fetchRssXml(settings.rssFeedUrl, settings.timeoutMs);
    const noteTitle = titleFromFileName(name);
    const newBody = buildPodcastMarkdownFromRss(xml, now, settings, noteTitle);
    const newContent = buildUpdatedPodcastFileContent(content, newBody, now);
    if (newContent === content) return 'skipped';
    await fs.writeFile(uri, newContent, {encoding: 'utf8'});
    return 'synced';
  } catch (err) {
    console.error(
      `[podcast-rss-sync] Failed: ${name} (rssFeedUrl=${settings.rssFeedUrl}, timeoutMs=${settings.timeoutMs})`,
      err,
    );
    return 'failed';
  }
}

async function mergeIntoEpisodesFiles(
  allFiles: RootMarkdownFile[],
  pieContentByName: Map<string, string>,
  fs: VaultFilesystem,
  now: Date,
): Promise<void> {
  const currentYear = now.getFullYear();
  const episodesFiles = allFiles.filter(f => isPodcastFile(f.name, currentYear));
  const byName = new Map(allFiles.map(f => [f.name, f]));

  for (const episodesFile of episodesFiles) {
    const hubName = companionHubFileName(episodesFile.name);
    if (!hubName) continue;
    const hubFile = byName.get(hubName);
    if (!hubFile) continue;

    const hubContent = await fs.readFile(hubFile.uri, {encoding: 'utf8'});
    const linkedNames = parseUncheckedHubLinks(hubContent);
    if (linkedNames.length === 0) continue;

    const pieFiles: Array<{series: string; content: string}> = [];
    for (const pieName of linkedNames) {
      const pieFile = byName.get(pieName);
      if (!pieFile) continue;
      const content =
        pieContentByName.get(pieName) ??
        (await fs.readFile(pieFile.uri, {encoding: 'utf8'}));
      const series = pieName.replace(/^📻\s*/u, '').replace(/\.md$/i, '').trim() || pieName;
      pieFiles.push({series, content});
    }
    if (pieFiles.length === 0) continue;

    const existing = await fs.readFile(episodesFile.uri, {encoding: 'utf8'});
    const merged = mergePodcastsFeedContent(existing, pieFiles, now);
    if (merged !== existing) {
      await fs.writeFile(episodesFile.uri, merged, {encoding: 'utf8'});
    }
  }
}

async function runSync(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<DesktopRssSyncResult> {
  const allFiles = await listGeneralMarkdownFiles(baseUri, fs);
  const relevant = filterPodcastRelevantGeneralMarkdownFiles(allFiles);
  const {rssFeedFiles} = splitPodcastAndRssMarkdownFiles(relevant);

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const now = new Date();
  const updatedPieContents = new Map<string, string>();

  for (const file of rssFeedFiles) {
    const outcome = await syncSingleFile(file.uri, file.name, fs, now);
    if (outcome === 'synced') {
      syncedCount++;
      // Cache the updated content so the merge step doesn't re-read from disk.
      const updated = await fs.readFile(file.uri, {encoding: 'utf8'});
      updatedPieContents.set(file.name, updated);
    } else if (outcome === 'skipped') {
      skippedCount++;
    } else {
      failedCount++;
    }
  }

  try {
    await mergeIntoEpisodesFiles(allFiles, updatedPieContents, fs, now);
  } catch (err) {
    console.error('[podcast-rss-sync] Merge into episodes files failed:', err);
  }

  return {syncedCount, skippedCount, failedCount};
}

export function runDesktopPodcastRssSync(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<DesktopRssSyncResult> {
  if (syncChain != null) return syncChain;
  const chain = runSync(baseUri, fs).finally(() => {
    syncChain = null;
  });
  syncChain = chain;
  return chain;
}
