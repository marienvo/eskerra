import {
  readPodcastFileContent,
  writePodcastFileContent,
} from '../src/core/storage/noteboxStorage';
import {
  markEpisodeAsPlayed,
  markEpisodeAsPlayedInContent,
  prepareMarkEpisodeAsPlayed,
} from '../src/features/podcasts/services/markEpisodeAsPlayed';
import {PodcastEpisode} from '../src/types';

jest.mock('../src/core/storage/noteboxStorage', () => ({
  readPodcastFileContent: jest.fn(),
  writePodcastFileContent: jest.fn(),
}));

const episodeFixture: PodcastEpisode = {
  date: '2026-03-20',
  id: 'https://example.com/a.mp3',
  isListened: false,
  mp3Url: 'https://example.com/a.mp3',
  sectionTitle: 'Demo',
  seriesName: 'Series A',
  sourceFile: '2026 Demo - podcasts.md',
  title: 'Episode A',
};

describe('markEpisodeAsPlayedInContent', () => {
  test('replaces [ ] with [x] on matching episode line', () => {
    const content = [
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
      '- [ ] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    ].join('\n');

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/b.mp3',
    );

    expect(updated).toBe(true);
    expect(nextContent).toContain(
      '- [x] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    );
  });

  test('does not change a line already marked [x]', () => {
    const content =
      '- [x] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)';

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/a.mp3',
    );

    expect(updated).toBe(false);
    expect(nextContent).toBe(content);
  });

  test('does not change non-matching lines', () => {
    const content = [
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
      '- [ ] 2026-03-21; Episode B [▶️](https://example.com/b.mp3) (Series B)',
    ].join('\n');

    const {nextContent, updated} = markEpisodeAsPlayedInContent(
      content,
      'https://example.com/c.mp3',
    );

    expect(updated).toBe(false);
    expect(nextContent).toBe(content);
  });
});

describe('prepareMarkEpisodeAsPlayed', () => {
  const readMock = readPodcastFileContent as jest.MockedFunction<
    typeof readPodcastFileContent
  >;
  const writeMock = writePodcastFileContent as jest.MockedFunction<
    typeof writePodcastFileContent
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when line is already played', async () => {
    readMock.mockResolvedValue(
      '- [x] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
    );

    const prepared = await prepareMarkEpisodeAsPlayed('content://v', episodeFixture);

    expect(prepared).toBeNull();
    expect(writeMock).not.toHaveBeenCalled();
  });

  test('returns fileUri and nextContent when unplayed line matches', async () => {
    readMock.mockResolvedValue(
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
    );

    const prepared = await prepareMarkEpisodeAsPlayed('content://v', episodeFixture);

    expect(prepared).toEqual({
      fileUri: 'content://v/General/2026 Demo - podcasts.md',
      nextContent:
        '- [x] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
    });
  });

  test('markEpisodeAsPlayed writes prepared content once', async () => {
    readMock.mockResolvedValue(
      '- [ ] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
    );

    const ok = await markEpisodeAsPlayed('content://v', episodeFixture);

    expect(ok).toBe(true);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock.mock.calls[0]).toEqual([
      'content://v/General/2026 Demo - podcasts.md',
      '- [x] 2026-03-20; Episode A [▶️](https://example.com/a.mp3) (Series A)',
    ]);
  });
});
