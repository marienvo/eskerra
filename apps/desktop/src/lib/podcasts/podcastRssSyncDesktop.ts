import {
  buildPodcastMarkdownFromRss,
  buildUpdatedPodcastFileContent,
  companionHubFileName,
  mergePodcastsFeedContent,
  parsePodcastRssSettingsFromContent,
  parseUncheckedHubLinks,
} from '@eskerra/core';
import type {VaultFilesystem} from '@eskerra/core';

import {
  filterPodcastRelevantGeneralMarkdownFiles,
  splitPodcastAndRssMarkdownFiles,
} from './generalIndex';
import {isPodcastFile} from './podcastParser';
import {listGeneralMarkdownFiles} from './podcastPhase1Desktop';
import type {RootMarkdownFile} from './podcastTypes';

export type DesktopRssSyncResult = {
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type DesktopRssSyncProgressPayload = {
  percent: number;
  phase: 'rss_file' | 'complete';
  detail?: string;
};

export type DesktopRssSyncOptions = {
  onProgress?: (payload: DesktopRssSyncProgressPayload) => void;
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

  const xmlTexts: string[] = [];
  let lastError: unknown = null;
  for (const url of settings.rssFeedUrls) {
    try {
      xmlTexts.push(await fetchRssXml(url, settings.timeoutMs));
    } catch (err) {
      lastError = err;
      console.error(
        `[podcast-rss-sync] Feed failed: ${name} (rssFeedUrl=${url}, timeoutMs=${settings.timeoutMs})`,
        err,
      );
    }
  }
  if (xmlTexts.length === 0) {
    console.error(
      `[podcast-rss-sync] Failed: ${name} (rssFeedUrls=${settings.rssFeedUrls.join(', ')}, timeoutMs=${settings.timeoutMs})`,
      lastError,
    );
    return 'failed';
  }
  try {
    const noteTitle = titleFromFileName(name);
    const newBody = buildPodcastMarkdownFromRss(xmlTexts, now, settings, noteTitle);
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

async function collectRssFilesFromUncheckedHubLinks(
  allFiles: RootMarkdownFile[],
  fs: VaultFilesystem,
  now: Date,
): Promise<RootMarkdownFile[]> {
  const currentYear = now.getFullYear();
  const relevant = filterPodcastRelevantGeneralMarkdownFiles(allFiles);
  const {podcastFiles, rssFeedFiles} = splitPodcastAndRssMarkdownFiles(relevant);
  const byName = new Map(allFiles.map(f => [f.name, f]));
  const rssFeedFilesByName = new Map(rssFeedFiles.map(f => [f.name, f]));
  const selectedNames = new Set<string>();
  const selected: RootMarkdownFile[] = [];

  for (const episodesFile of podcastFiles.filter(f => isPodcastFile(f.name, currentYear))) {
    const hubName = companionHubFileName(episodesFile.name);
    if (!hubName) continue;
    const hubFile = byName.get(hubName);
    if (!hubFile) continue;

    const hubContent = await fs.readFile(hubFile.uri, {encoding: 'utf8'});
    for (const linkedName of parseUncheckedHubLinks(hubContent)) {
      if (selectedNames.has(linkedName)) continue;
      const rssFile = rssFeedFilesByName.get(linkedName);
      if (!rssFile) continue;
      selectedNames.add(linkedName);
      selected.push(rssFile);
    }
  }

  return selected;
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
  options?: DesktopRssSyncOptions,
): Promise<DesktopRssSyncResult> {
  const allFiles = await listGeneralMarkdownFiles(baseUri, fs);

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const now = new Date();
  const rssFeedFiles = await collectRssFilesFromUncheckedHubLinks(allFiles, fs, now);
  const updatedPieContents = new Map<string, string>();
  const rssDenom = Math.max(1, rssFeedFiles.length);

  let doneRss = 0;
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
    doneRss++;
    options?.onProgress?.({
      percent: Math.min(99, Math.floor((doneRss * 100) / rssDenom)),
      phase: 'rss_file',
      detail: file.name,
    });
  }

  try {
    await mergeIntoEpisodesFiles(allFiles, updatedPieContents, fs, now);
  } catch (err) {
    console.error('[podcast-rss-sync] Merge into episodes files failed:', err);
  }

  options?.onProgress?.({percent: 100, phase: 'complete'});
  return {syncedCount, skippedCount, failedCount};
}

export function runDesktopPodcastRssSync(
  baseUri: string,
  fs: VaultFilesystem,
  options?: DesktopRssSyncOptions,
): Promise<DesktopRssSyncResult> {
  if (syncChain != null) return syncChain;
  const chain = runSync(baseUri, fs, options).finally(() => {
    syncChain = null;
  });
  syncChain = chain;
  return chain;
}
