import {describe, expect, it} from 'vitest';

import {extractRssPodcastTitle} from './rssParser';

describe('extractRssPodcastTitle', () => {
  it('reads ATX H1 with tab after hash', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
#\tTab-Separated Title`;

    expect(extractRssPodcastTitle('wrong-filename.md', content)).toBe('Tab-Separated Title');
  });

  it('ignores hashtag lines without space after #', () => {
    const content = `---
rssFeedUrl: https://example.com/feed.xml
---
#rust
## not used as H1`;

    expect(extractRssPodcastTitle('📻 My Show.md', content)).toBe('My Show');
  });
});
