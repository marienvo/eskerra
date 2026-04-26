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

  test('extractRssFeedUrl ignores keys that only prefix-match rssFeedUrl', () => {
    const content = `---
rssFeedUrls:
  - https://wrong.example/feed.xml
rssFeedUrlBackup: https://backup.example/feed.xml
---

# Demo`;

    expect(extractRssFeedUrl(content)).toBeUndefined();
  });

  test('extractRssFeedUrl uses exact rssFeedUrl when other rss-prefixed keys exist', () => {
    const content = `---
rssFeedUrls: https://wrong.example/feed.xml
rssFeedUrl: https://canonical.example/feed.xml
---

# Demo`;

    expect(extractRssFeedUrl(content)).toBe('https://canonical.example/feed.xml');
  });

  test('extractRssPodcastTitle falls back to file name without emoji prefix', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
No markdown heading in this file`;

    expect(extractRssPodcastTitle('📻 De Dag.md', content)).toBe('De Dag');
  });

  test('extractRssPodcastTitle reads ATX H1 with tab after hash', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
#\tTab-Separated Title`;

    expect(extractRssPodcastTitle('wrong-filename.md', content)).toBe(
      'Tab-Separated Title',
    );
  });

  test('extractRssPodcastTitle ignores hashtag lines without space after #', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
#rust
## not used as H1`;

    expect(extractRssPodcastTitle('📻 My Show.md', content)).toBe('My Show');
  });
});
