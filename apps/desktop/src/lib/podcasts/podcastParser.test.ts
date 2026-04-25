import {describe, expect, it} from 'vitest';
import {parsePieNoteEpisodes} from './podcastParser';

const FILE_NAME = '📻 OVT.md';
const SERIES = 'OVT';

function buildContent(body: string): string {
  return `---\nrssFeedUrl: "https://example.com/feed.xml"\n---\n\n${body}`;
}

describe('parsePieNoteEpisodes', () => {
  it('returns [] for empty content', () => {
    expect(parsePieNoteEpisodes(FILE_NAME, '', SERIES)).toEqual([]);
  });

  it('returns [] when there are no date headings', () => {
    const content = buildContent('# OVT\n\nSome notes without episodes.\n');
    expect(parsePieNoteEpisodes(FILE_NAME, content, SERIES)).toEqual([]);
  });

  it('returns [] when there are date headings but no play-link bullets', () => {
    const content = buildContent('# OVT\n\n## Wednesday, April 23rd, 2025\n\nJust text.\n');
    expect(parsePieNoteEpisodes(FILE_NAME, content, SERIES)).toEqual([]);
  });

  it('parses a bullet with article link (angle-bracket URLs)', () => {
    const content = buildContent(
      '# OVT\n\n## Wednesday, April 23rd, 2025\n\n' +
        '- [🌐](<https://example.com/ep1>) Episode One [▶️](<https://audio.example.com/ep1.mp3>)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      date: '2025-04-23',
      title: 'Episode One',
      mp3Url: 'https://audio.example.com/ep1.mp3',
      articleUrl: 'https://example.com/ep1',
      seriesName: SERIES,
      sectionTitle: SERIES,
      isListened: false,
      id: 'https://audio.example.com/ep1.mp3',
      sourceFile: FILE_NAME,
    });
  });

  it('parses a bullet without article link', () => {
    const content = buildContent(
      '## Tuesday, April 22nd, 2025\n\n' +
        '- Episode Two [▶️](<https://audio.example.com/ep2.mp3>)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.articleUrl).toBeUndefined();
    expect(episodes[0]?.title).toBe('Episode Two');
    expect(episodes[0]?.date).toBe('2025-04-22');
  });

  it('parses plain (non-angle-bracket) URLs', () => {
    const content = buildContent(
      '## Monday, April 21st, 2025\n\n' +
        '- Episode Three [▶️](https://audio.example.com/ep3.mp3)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.mp3Url).toBe('https://audio.example.com/ep3.mp3');
  });

  it('parses multiple episodes under the same date heading', () => {
    const content = buildContent(
      '## Friday, April 18th, 2025\n\n' +
        '- Ep A [▶️](<https://audio.example.com/a.mp3>)\n' +
        '- Ep B [▶️](<https://audio.example.com/b.mp3>)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]?.title).toBe('Ep A');
    expect(episodes[1]?.title).toBe('Ep B');
    expect(episodes[0]?.date).toBe('2025-04-18');
    expect(episodes[1]?.date).toBe('2025-04-18');
  });

  it('assigns correct dates from multiple heading sections', () => {
    const content = buildContent(
      '## Wednesday, April 23rd, 2025\n\n' +
        '- Ep Wednesday [▶️](<https://audio.example.com/wed.mp3>)\n\n' +
        '## Tuesday, April 22nd, 2025\n\n' +
        '- Ep Tuesday [▶️](<https://audio.example.com/tue.mp3>)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]?.date).toBe('2025-04-23');
    expect(episodes[1]?.date).toBe('2025-04-22');
  });

  it('handles ordinals: 1st, 2nd, 3rd, 11th, 21st', () => {
    const cases: Array<[string, string]> = [
      ['## Wednesday, January 1st, 2025', '2025-01-01'],
      ['## Thursday, January 2nd, 2025', '2025-01-02'],
      ['## Friday, January 3rd, 2025', '2025-01-03'],
      ['## Sunday, November 11th, 2025', '2025-11-11'],
      ['## Wednesday, May 21st, 2025', '2025-05-21'],
    ];
    for (const [heading, expected] of cases) {
      const content = `${heading}\n\n- Ep [▶️](<https://audio.example.com/ep.mp3>)\n`;
      const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
      expect(episodes[0]?.date, `heading: ${heading}`).toBe(expected);
    }
  });

  it('uses seriesName parameter as both seriesName and sectionTitle', () => {
    const content = buildContent(
      '## Monday, March 10th, 2025\n\n' +
        '- An Episode [▶️](<https://audio.example.com/ep.mp3>)\n',
    );
    const series = 'My Custom Series';
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, series);
    expect(episodes[0]?.seriesName).toBe(series);
    expect(episodes[0]?.sectionTitle).toBe(series);
  });

  it('skips bullets with no play link', () => {
    const content = buildContent(
      '## Monday, March 10th, 2025\n\n' +
        '- Just a note without audio\n' +
        '- Valid Episode [▶️](<https://audio.example.com/ep.mp3>)\n',
    );
    const episodes = parsePieNoteEpisodes(FILE_NAME, content, SERIES);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.title).toBe('Valid Episode');
  });
});
