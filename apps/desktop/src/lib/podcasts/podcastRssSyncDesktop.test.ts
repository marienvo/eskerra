import {afterEach, describe, expect, it, vi} from 'vitest';

import {getGeneralDirectoryUri} from '@eskerra/core';
import type {VaultDirEntry, VaultFilesystem} from '@eskerra/core';

import {__resetForTests, runDesktopPodcastRssSync} from './podcastRssSyncDesktop';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({
    get: vi.fn(async () => undefined),
    save: vi.fn(async () => {}),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  })),
}));

const VAULT_ROOT = '/vault';
const GENERAL_URI = getGeneralDirectoryUri(VAULT_ROOT);
const RSS_FILE_NAME = '📻 OVT.md';
const RSS_FILE_URI = `${GENERAL_URI}/${RSS_FILE_NAME}`;
const RSS_FEED_URL = 'https://example.com/feed.xml';

const MINIMAL_EPISODE_XML = [
  '<rss version="2.0"><channel>',
  '<item><guid>ep-1</guid><title>Episode</title>',
  '<link>https://example.com/episode</link>',
  '<pubDate>Sun, 22 Feb 2026 12:00:00 GMT</pubDate></item>',
  '</channel></rss>',
].join('\n');

function mockFetch(xml: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ok: true, text: async () => xml}),
  );
}

function buildFs(files: Map<string, string>): VaultFilesystem {
  const entries: VaultDirEntry[] = [...files.entries()].map(([uri, _]) => ({
    uri,
    name: uri.split('/').pop() ?? '',
    type: 'file' as const,
    lastModified: 1000,
  }));

  return {
    exists: async (uri: string) => uri === GENERAL_URI || files.has(uri),
    mkdir: async () => {},
    readFile: async (uri: string) => {
      const v = files.get(uri);
      if (v == null) throw new Error(`readFile: not found ${uri}`);
      return v;
    },
    writeFile: async (uri: string, content: string) => {
      files.set(uri, content);
    },
    unlink: async () => {},
    renameFile: async () => {},
    listFiles: async (dirUri: string): Promise<VaultDirEntry[]> =>
      dirUri === GENERAL_URI ? entries : [],
    removeTree: async () => {},
  };
}

describe('runDesktopPodcastRssSync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetForTests();
  });

  it('fetches RSS and writes updated content with rssFetchedAt', async () => {
    const original =
      `---\nrssFeedUrl: "${RSS_FEED_URL}"\n---\n\n# OVT\n`;
    const files = new Map([[RSS_FILE_URI, original]]);
    const fs = buildFs(files);
    mockFetch(MINIMAL_EPISODE_XML);

    const result = await runDesktopPodcastRssSync(VAULT_ROOT, fs);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);

    const written = files.get(RSS_FILE_URI);
    expect(written).toContain('rssFetchedAt:');
    expect(written).toContain('rssFeedUrl:');
    expect(written).toContain('# OVT');
  });

  it('skips file when still within cooldown', async () => {
    const recentFetch = new Date(Date.now() - 5 * 60_000).toISOString();
    const original =
      `---\nrssFetchedAt: "${recentFetch}"\nrssFeedUrl: "${RSS_FEED_URL}"\n---\n\n# OVT\n`;
    const files = new Map([[RSS_FILE_URI, original]]);
    const fs = buildFs(files);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runDesktopPodcastRssSync(VAULT_ROOT, fs);

    expect(result.skippedCount).toBe(1);
    expect(result.syncedCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(files.get(RSS_FILE_URI)).toBe(original);
  });

  it('skips file with no rssFeedUrl', async () => {
    const original = '---\ntitle: No feed\n---\n\n# Pod\n';
    const files = new Map([[RSS_FILE_URI, original]]);
    const fs = buildFs(files);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runDesktopPodcastRssSync(VAULT_ROOT, fs);

    expect(result.skippedCount).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failed when fetch throws, and continues to other files', async () => {
    const failingName = '📻 A.md';
    const healthyName = '📻 B.md';
    const failingUri = `${GENERAL_URI}/${failingName}`;
    const healthyUri = `${GENERAL_URI}/${healthyName}`;
    const failingUrl = 'https://example.com/fail.xml';
    const healthyUrl = 'https://example.com/ok.xml';
    const files = new Map([
      [failingUri, `---\nrssFeedUrl: "${failingUrl}"\n---\n\n# A\n`],
      [healthyUri, `---\nrssFeedUrl: "${healthyUrl}"\n---\n\n# B\n`],
    ]);

    const entries: VaultDirEntry[] = [
      {uri: failingUri, name: failingName, type: 'file', lastModified: 1000},
      {uri: healthyUri, name: healthyName, type: 'file', lastModified: 1000},
    ];

    const fs: VaultFilesystem = {
      exists: async (uri: string) => uri === GENERAL_URI || files.has(uri),
      mkdir: async () => {},
      readFile: async (uri: string) => {
        const v = files.get(uri);
        if (v == null) throw new Error('not found');
        return v;
      },
      writeFile: async (uri: string, content: string) => {
        files.set(uri, content);
      },
      unlink: async () => {},
      renameFile: async () => {},
      listFiles: async (dirUri: string) => (dirUri === GENERAL_URI ? entries : []),
      removeTree: async () => {},
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === failingUrl) throw new DOMException('aborted', 'AbortError');
        return {ok: true, text: async () => MINIMAL_EPISODE_XML};
      }),
    );

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runDesktopPodcastRssSync(VAULT_ROOT, fs);

    expect(result.failedCount).toBe(1);
    expect(result.syncedCount).toBe(1);
    expect(files.get(failingUri)).not.toContain('rssFetchedAt:');
    expect(files.get(healthyUri)).toContain('rssFetchedAt:');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[podcast-rss-sync] Failed:'),
      expect.any(DOMException),
    );
    consoleError.mockRestore();
  });

  it('coalesces concurrent calls into one run', async () => {
    const original = `---\nrssFeedUrl: "${RSS_FEED_URL}"\n---\n\n# OVT\n`;
    const files = new Map([[RSS_FILE_URI, original]]);
    const fs = buildFs(files);
    const fetchMock = vi.fn().mockResolvedValue({ok: true, text: async () => MINIMAL_EPISODE_XML});
    vi.stubGlobal('fetch', fetchMock);

    const [r1, r2] = await Promise.all([
      runDesktopPodcastRssSync(VAULT_ROOT, fs),
      runDesktopPodcastRssSync(VAULT_ROOT, fs),
    ]);

    expect(r1).toBe(r2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 0 counts when General/ directory has no 📻 files', async () => {
    const fs: VaultFilesystem = {
      exists: async () => false,
      mkdir: async () => {},
      readFile: async () => { throw new Error('not found'); },
      writeFile: async () => {},
      unlink: async () => {},
      renameFile: async () => {},
      listFiles: async () => [],
      removeTree: async () => {},
    };

    const result = await runDesktopPodcastRssSync(VAULT_ROOT, fs);
    expect(result).toEqual({syncedCount: 0, skippedCount: 0, failedCount: 0});
  });
});
