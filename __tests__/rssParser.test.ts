import {
  extractRssFeedUrl,
  extractRssPodcastTitle,
} from '../src/features/podcasts/services/rssParser';

describe('rssParser', () => {
  test('extractRssFeedUrl reads scalar url from frontmatter', () => {
    const content = `---
rssFeedUrl: "https://example.com/feed.xml"
---

# Demo Podcast`;

    expect(extractRssFeedUrl(content)).toBe('https://example.com/feed.xml');
  });

  test('extractRssFeedUrl reads first url from yaml list', () => {
    const content = `---
rssFeedUrl:
  - https://podcast.npo.nl/feed/dit-is-de-dag.xml
  - https://podcast.npo.nl/feed/fallback.xml
---

# De Dag`;

    expect(extractRssFeedUrl(content)).toBe(
      'https://podcast.npo.nl/feed/dit-is-de-dag.xml',
    );
  });

  test('extractRssFeedUrl returns undefined when frontmatter is missing', () => {
    const content = '# No frontmatter';
    expect(extractRssFeedUrl(content)).toBeUndefined();
  });

  test('extractRssPodcastTitle falls back to file name without emoji prefix', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
No markdown heading in this file`;

    expect(extractRssPodcastTitle('📻 De Dag.md', content)).toBe('De Dag');
  });
});
