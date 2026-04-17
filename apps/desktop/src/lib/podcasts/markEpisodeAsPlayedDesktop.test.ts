import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getGeneralDirectoryUri} from '@eskerra/core';
import type {VaultDirEntry, VaultFilesystem} from '@eskerra/core';

import {
  buildPodcastSectionsFromPodcastMarkdownFiles,
  clearPodcastMarkdownFileContentCache,
  primePodcastMarkdownFileContentCacheEntry,
} from './podcastPhase1Desktop';
import {
  markDesktopEpisodeAsPlayed,
  markDesktopEpisodeAsPlayedAndRefreshCatalog,
} from './markEpisodeAsPlayedDesktop';
import type {PodcastEpisode, RootMarkdownFile} from './podcastTypes';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({
    get: vi.fn(async () => undefined),
    save: vi.fn(async () => {}),
    set: vi.fn(async () => {}),
  })),
}));

const VAULT_ROOT = '/v';
const YEAR = new Date().getFullYear();
const PODCAST_FILE_NAME = `${YEAR} StaleCachePod - podcasts.md`;
const GENERAL_URI = getGeneralDirectoryUri(VAULT_ROOT);
const PODCAST_FILE_URI = `${GENERAL_URI}/${PODCAST_FILE_NAME}`;

const MP3 = 'https://example.com/episode.mp3';
const UNPLAYED_LINE = `- [ ] 2026-01-01;Stale title [▶️](${MP3}) (StaleSeries)`;

const EPISODE: PodcastEpisode = {
  articleUrl: undefined,
  date: '2026-01-01',
  id: MP3,
  isListened: false,
  mp3Url: MP3,
  rssFeedUrl: undefined,
  sectionTitle: 'StaleCachePod',
  seriesName: 'StaleSeries',
  sourceFile: PODCAST_FILE_NAME,
  title: 'Stale title',
};

function createPodcastMemoryFs(opts: {
  lastModified: number;
  initialBody: string;
}): VaultFilesystem {
  const store = new Map<string, string | 'dir'>([
    [VAULT_ROOT, 'dir'],
    [GENERAL_URI, 'dir'],
    [PODCAST_FILE_URI, opts.initialBody],
  ]);

  return {
    exists: async uri => store.has(uri),
    mkdir: async uri => {
      store.set(uri, 'dir');
    },
    readFile: async uri => {
      const v = store.get(uri);
      if (v === 'dir' || v === undefined) {
        throw new Error(`readFile: not found ${uri}`);
      }
      return v;
    },
    writeFile: async (uri, content, _opts) => {
      store.set(uri, content);
    },
    unlink: async uri => {
      store.delete(uri);
    },
    renameFile: async (fromUri, toUri) => {
      const v = store.get(fromUri);
      if (v === undefined || v === 'dir') {
        throw new Error('not found');
      }
      store.delete(fromUri);
      store.set(toUri, v);
    },
    listFiles: async (directoryUri: string): Promise<VaultDirEntry[]> => {
      if (directoryUri === GENERAL_URI) {
        return [
          {
            lastModified: opts.lastModified,
            name: PODCAST_FILE_NAME,
            type: 'file',
            uri: PODCAST_FILE_URI,
          },
        ];
      }
      return [];
    },
    removeTree: async () => {},
  };
}

describe('markDesktopEpisodeAsPlayed', () => {
  beforeEach(() => {
    clearPodcastMarkdownFileContentCache();
  });

  it('writes played checkbox line via writeFile', async () => {
    const fs = createPodcastMemoryFs({initialBody: `${UNPLAYED_LINE}\n`, lastModified: 9001});
    const writeSpy = vi.spyOn(fs, 'writeFile');

    await expect(markDesktopEpisodeAsPlayed(VAULT_ROOT, fs, EPISODE)).resolves.toBe(true);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[1] as string | undefined;
    expect(written).toBeDefined();
    expect(written).toContain('- [x]');
    expect(await fs.readFile(PODCAST_FILE_URI, {encoding: 'utf8'})).toContain('- [x]');
  });

  it('after mark, catalog rebuild drops episode when stale session cache would have kept unplayed', async () => {
    const staleLm = 4242;
    const initialBody = `${UNPLAYED_LINE}\n`;
    const fs = createPodcastMemoryFs({initialBody, lastModified: staleLm});

    const podcastFile: RootMarkdownFile = {
      lastModified: staleLm,
      name: PODCAST_FILE_NAME,
      uri: PODCAST_FILE_URI,
    };

    await buildPodcastSectionsFromPodcastMarkdownFiles(VAULT_ROOT, [podcastFile], fs);
    primePodcastMarkdownFileContentCacheEntry(PODCAST_FILE_URI, staleLm, initialBody);

    const staleSections = (
      await buildPodcastSectionsFromPodcastMarkdownFiles(VAULT_ROOT, [podcastFile], fs)
    ).nextSections;
    expect(staleSections.flatMap(s => s.episodes)).toHaveLength(1);

    await markDesktopEpisodeAsPlayed(VAULT_ROOT, fs, EPISODE);

    const after = await buildPodcastSectionsFromPodcastMarkdownFiles(VAULT_ROOT, [podcastFile], fs);
    expect(after.nextSections.flatMap(s => s.episodes)).toHaveLength(0);
  });
});

describe('markDesktopEpisodeAsPlayedAndRefreshCatalog', () => {
  beforeEach(() => {
    clearPodcastMarkdownFileContentCache();
  });

  it('invokes catalog refresh after marking played', async () => {
    const fs = createPodcastMemoryFs({initialBody: `${UNPLAYED_LINE}\n`, lastModified: 9001});
    const refresh = vi.fn().mockResolvedValue(undefined);
    await markDesktopEpisodeAsPlayedAndRefreshCatalog(VAULT_ROOT, fs, EPISODE, refresh);
    expect(refresh).toHaveBeenCalledTimes(1);
    const body = await fs.readFile(PODCAST_FILE_URI, {encoding: 'utf8'});
    expect(body).toContain('- [x]');
  });

  it('skips vault write and refresh when vault root is null', async () => {
    const fs = createPodcastMemoryFs({initialBody: `${UNPLAYED_LINE}\n`, lastModified: 9001});
    const refresh = vi.fn().mockResolvedValue(undefined);
    const writeSpy = vi.spyOn(fs, 'writeFile');
    await markDesktopEpisodeAsPlayedAndRefreshCatalog(null, fs, EPISODE, refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
