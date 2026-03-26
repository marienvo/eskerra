import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPersistedPodcastMarkdownIndexForTesting,
  filterPodcastRelevantGeneralMarkdownFiles,
  loadPersistedPodcastMarkdownIndex,
  podcastMarkdownIndexSignature,
  savePersistedPodcastMarkdownIndex,
  splitPodcastAndRssMarkdownFiles,
} from '../src/features/podcasts/services/generalPodcastMarkdownIndexCache';
import {RootMarkdownFile} from '../src/types';

describe('generalPodcastMarkdownIndexCache', () => {
  const asyncStorageGetItemMock = AsyncStorage.getItem as jest.MockedFunction<
    typeof AsyncStorage.getItem
  >;
  const asyncStorageSetItemMock = AsyncStorage.setItem as jest.MockedFunction<
    typeof AsyncStorage.setItem
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorageGetItemMock.mockResolvedValue(null);
    asyncStorageSetItemMock.mockResolvedValue();
  });

  test('filterPodcastRelevantGeneralMarkdownFiles keeps podcast and RSS emoji files', () => {
    const currentYear = new Date().getFullYear();
    const files: RootMarkdownFile[] = [
      {lastModified: 1, name: 'note.md', uri: 'u1'},
      {lastModified: 2, name: `${currentYear} Show - podcasts.md`, uri: 'u2'},
      {lastModified: 3, name: '📻 Show.md', uri: 'u3'},
    ];
    const filtered = filterPodcastRelevantGeneralMarkdownFiles(files);
    expect(filtered.map(f => f.name)).toEqual([
      `${currentYear} Show - podcasts.md`,
      '📻 Show.md',
    ]);
  });

  test('save and load round-trip', async () => {
    const baseUri = 'content://vault-x';
    const entries: RootMarkdownFile[] = [
      {lastModified: 10, name: '2026 X - podcasts.md', uri: 'content://a'},
    ];

    let stored: string | null = null;
    asyncStorageSetItemMock.mockImplementation(async (_key, value) => {
      stored = value as string;
    });
    asyncStorageGetItemMock.mockImplementation(async () => stored);

    await savePersistedPodcastMarkdownIndex(baseUri, entries);
    const loaded = await loadPersistedPodcastMarkdownIndex(baseUri);
    expect(loaded).toEqual(entries);
  });

  test('podcastMarkdownIndexSignature changes when lastModified changes', () => {
    const a: RootMarkdownFile[] = [{lastModified: 1, name: 'n', uri: 'u'}];
    const b: RootMarkdownFile[] = [{lastModified: 2, name: 'n', uri: 'u'}];
    expect(podcastMarkdownIndexSignature(a)).not.toBe(podcastMarkdownIndexSignature(b));
  });

  test('splitPodcastAndRssMarkdownFiles partitions by pattern', () => {
    const currentYear = new Date().getFullYear();
    const files: RootMarkdownFile[] = [
      {lastModified: 1, name: `${currentYear} A - podcasts.md`, uri: 'p'},
      {lastModified: 2, name: '📻 A.md', uri: 'r'},
    ];
    const {podcastFiles, rssFeedFiles} = splitPodcastAndRssMarkdownFiles(files);
    expect(podcastFiles).toHaveLength(1);
    expect(rssFeedFiles).toHaveLength(1);
  });

  test('clearPersistedPodcastMarkdownIndexForTesting removes key', async () => {
    const removeMock = AsyncStorage.removeItem as jest.MockedFunction<
      typeof AsyncStorage.removeItem
    >;
    removeMock.mockResolvedValue();
    await clearPersistedPodcastMarkdownIndexForTesting('content://v');
    expect(removeMock).toHaveBeenCalledWith(
      'notebox:generalPodcastMarkdownIndex:content://v',
    );
  });
});
