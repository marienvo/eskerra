import {
  extractSectionTitle,
  groupBySection,
  isPodcastFile,
  parsePodcastFile,
  parsePodcastLine,
} from '../src/features/podcasts/services/podcastParser';

describe('podcastParser', () => {
  test('isPodcastFile accepts current and next year files', () => {
    expect(isPodcastFile('2026 Demo - podcasts.md', 2026)).toBe(true);
    expect(isPodcastFile('2027 Demo - podcasts.md', 2026)).toBe(true);
  });

  test('isPodcastFile rejects unsupported year and invalid name', () => {
    expect(isPodcastFile('2025 Demo - podcasts.md', 2026)).toBe(false);
    expect(isPodcastFile('2026 Demo - podcast.md', 2026)).toBe(false);
  });

  test('extractSectionTitle returns section from file name', () => {
    expect(extractSectionTitle('2026 Demo - podcasts.md')).toBe('Demo');
    expect(extractSectionTitle('invalid.md')).toBeNull();
  });

  test('parsePodcastLine parses unplayed episode without article link', () => {
    const line =
      '- [ ] 2026-03-20; #52 - Flitspalen, een gereedschapskist en een bosje tulpen (S10) [▶️](https://example.com/episode.mp3) (De Stemming van Vullings en De Rooy ●)';

    expect(
      parsePodcastLine({
        line,
        sectionTitle: 'Demo',
        sourceFile: '2026 Demo - podcasts.md',
      }),
    ).toEqual({
      articleUrl: undefined,
      date: '2026-03-20',
      id: 'https://example.com/episode.mp3',
      isListened: false,
      mp3Url: 'https://example.com/episode.mp3',
      sectionTitle: 'Demo',
      seriesName: 'De Stemming van Vullings en De Rooy ●',
      sourceFile: '2026 Demo - podcasts.md',
      title: '#52 - Flitspalen, een gereedschapskist en een bosje tulpen (S10)',
    });
  });

  test('parsePodcastLine parses listened episode with article link', () => {
    const line =
      "- [x] 2026-03-20; [🌐](https://example.com/article) Van Iran tot Oekraïne: hackers storten zich op beveiligingscamera's [▶️](https://example.com/audio.mp3) (Schaduwoorlog)";

    expect(
      parsePodcastLine({
        line,
        sectionTitle: 'Nieuws',
        sourceFile: '2026 Nieuws - podcasts.md',
      }),
    ).toEqual({
      articleUrl: 'https://example.com/article',
      date: '2026-03-20',
      id: 'https://example.com/audio.mp3',
      isListened: true,
      mp3Url: 'https://example.com/audio.mp3',
      sectionTitle: 'Nieuws',
      seriesName: 'Schaduwoorlog',
      sourceFile: '2026 Nieuws - podcasts.md',
      title: "Van Iran tot Oekraïne: hackers storten zich op beveiligingscamera's",
    });
  });

  test('parsePodcastLine returns null for malformed line', () => {
    expect(
      parsePodcastLine({
        line: '- [ ] missing date and links',
        sectionTitle: 'Demo',
        sourceFile: '2026 Demo - podcasts.md',
      }),
    ).toBeNull();
  });

  test('parsePodcastFile returns only valid entries and ignores wrong year', () => {
    const content = [
      '- [ ] 2026-01-02; Titel A [▶️](https://example.com/a.mp3) (Serie A)',
      '- [x] 2026-01-03; [🌐](https://example.com) Titel B [▶️](https://example.com/b.mp3) (Serie B)',
      'Not an entry',
    ].join('\n');

    expect(parsePodcastFile('2026 Demo - podcasts.md', content, 2026)).toHaveLength(
      2,
    );
    expect(parsePodcastFile('2024 Demo - podcasts.md', content, 2026)).toEqual([]);
  });

  test('groupBySection groups episodes under shared section', () => {
    const parsed = parsePodcastFile(
      '2026 Demo - podcasts.md',
      [
        '- [ ] 2026-01-02; Titel A [▶️](https://example.com/a.mp3) (Serie A)',
        '- [ ] 2026-01-03; Titel B [▶️](https://example.com/b.mp3) (Serie B)',
      ].join('\n'),
      2026,
    );

    const sections = groupBySection(parsed);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Demo');
    expect(sections[0].episodes.map(episode => episode.id)).toEqual([
      'https://example.com/b.mp3',
      'https://example.com/a.mp3',
    ]);
  });
});
