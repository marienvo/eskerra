import {describe, expect, it} from 'vitest';

import {
  PODCAST_FIXTURE_EPISODE_LINE_PLAYED,
  PODCAST_FIXTURE_EPISODE_LINE_UNPLAYED,
  PODCAST_FIXTURE_GROUP_BODY,
  PODCAST_FIXTURE_MULTI_LINE_BODY,
} from './podcastMarkdownFixtures';
import {
  extractPodcastSectionTitle,
  groupPodcastEpisodesBySection,
  isPodcastEpisodesFile,
  parsePodcastEpisodeLine,
  parsePodcastEpisodesMarkdownFile,
} from './podcastFileParser';

describe('podcastFileParser', () => {
  it('isPodcastEpisodesFile accepts current and next year files', () => {
    expect(isPodcastEpisodesFile('2026 Demo - podcasts.md', 2026)).toBe(true);
    expect(isPodcastEpisodesFile('2027 Demo - podcasts.md', 2026)).toBe(true);
  });

  it('isPodcastEpisodesFile accepts flexible whitespace in the file name', () => {
    expect(isPodcastEpisodesFile('2026 My Show  - podcasts.md', 2026)).toBe(true);
    expect(isPodcastEpisodesFile('2026\tMy Show - podcasts.md', 2026)).toBe(true);
  });

  it('isPodcastEpisodesFile rejects unsupported year and invalid name', () => {
    expect(isPodcastEpisodesFile('2025 Demo - podcasts.md', 2026)).toBe(false);
    expect(isPodcastEpisodesFile('2026 Demo - podcast.md', 2026)).toBe(false);
  });

  it('extractPodcastSectionTitle returns section from file name', () => {
    expect(extractPodcastSectionTitle('2026 Demo - podcasts.md')).toBe('Demo');
    expect(extractPodcastSectionTitle('invalid.md')).toBeNull();
  });

  it('parsePodcastEpisodeLine parses unplayed episode without article link', () => {
    expect(
      parsePodcastEpisodeLine({
        line: PODCAST_FIXTURE_EPISODE_LINE_UNPLAYED,
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

  it('parsePodcastEpisodeLine parses listened episode with article link', () => {
    expect(
      parsePodcastEpisodeLine({
        line: PODCAST_FIXTURE_EPISODE_LINE_PLAYED,
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

  it('parsePodcastEpisodeLine returns null for malformed line', () => {
    expect(
      parsePodcastEpisodeLine({
        line: '- [ ] missing date and links',
        sectionTitle: 'Demo',
        sourceFile: '2026 Demo - podcasts.md',
      }),
    ).toBeNull();
  });

  it('parsePodcastEpisodesMarkdownFile returns only valid entries and ignores wrong year', () => {
    expect(
      parsePodcastEpisodesMarkdownFile('2026 Demo - podcasts.md', PODCAST_FIXTURE_MULTI_LINE_BODY, 2026),
    ).toHaveLength(2);
    expect(
      parsePodcastEpisodesMarkdownFile('2024 Demo - podcasts.md', PODCAST_FIXTURE_MULTI_LINE_BODY, 2026),
    ).toEqual([]);
  });

  it('groupPodcastEpisodesBySection groups episodes under shared section', () => {
    const parsed = parsePodcastEpisodesMarkdownFile(
      '2026 Demo - podcasts.md',
      PODCAST_FIXTURE_GROUP_BODY,
      2026,
    );

    const sections = groupPodcastEpisodesBySection(parsed);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Demo');
    expect(sections[0].episodes.map(episode => episode.id)).toEqual([
      'https://example.com/b.mp3',
      'https://example.com/a.mp3',
    ]);
  });
});
