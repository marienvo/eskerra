import {describe, expect, it} from 'vitest';

import {parseRssArtworkUrl} from './rssArtwork';

describe('parseRssArtworkUrl', () => {
  it('parses NPO-like itunes:image href', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <title>Bureau Buitenland</title>
          <itunes:image href="https://images.npo.nl/image/upload/v1/bureau-buitenland.jpg" />
        </channel>
      </rss>`;

    expect(parseRssArtworkUrl(xml)).toBe(
      'https://images.npo.nl/image/upload/v1/bureau-buitenland.jpg',
    );
  });

  it('supports atom feeds with logo artwork', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom podcast</title>
        <logo>https://cdn.example.com/atom-logo.png</logo>
      </feed>`;

    expect(parseRssArtworkUrl(atomXml)).toBe('https://cdn.example.com/atom-logo.png');
  });
});
