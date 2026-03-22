import {
  fetchRssArtworkUrl,
  parseRssArtworkUrl,
} from '../src/features/podcasts/services/rssArtwork';

describe('fetchRssArtworkUrl', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as {fetch?: typeof fetch}).fetch = fetchMock as never;
  });

  test('prioritizes itunes:image over other fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <itunes:image href="https://cdn.example.com/itunes.jpg" />
            <image>
              <url>https://cdn.example.com/rss.jpg</url>
            </image>
          </channel>
        </rss>`,
    });

    await expect(fetchRssArtworkUrl('https://feed.example.com/rss.xml')).resolves.toBe(
      'https://cdn.example.com/itunes.jpg',
    );
  });

  test('parses NPO-like itunes:image href directly from xml', () => {
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

  test('falls back to channel image url when itunes:image is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <image>
              <url>https://cdn.example.com/rss.jpg</url>
            </image>
          </channel>
        </rss>`,
    });

    await expect(fetchRssArtworkUrl('https://feed.example.com/rss.xml')).resolves.toBe(
      'https://cdn.example.com/rss.jpg',
    );
  });

  test('falls back to media:thumbnail then googleplay:image', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
            <channel>
              <media:thumbnail url="https://cdn.example.com/media.jpg" />
            </channel>
          </rss>`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0" xmlns:googleplay="http://www.google.com/schemas/play-podcasts/1.0">
            <channel>
              <googleplay:image href="https://cdn.example.com/google.jpg" />
            </channel>
          </rss>`,
      });

    await expect(fetchRssArtworkUrl('https://feed.example.com/with-media.xml')).resolves.toBe(
      'https://cdn.example.com/media.jpg',
    );
    await expect(fetchRssArtworkUrl('https://feed.example.com/with-google.xml')).resolves.toBe(
      'https://cdn.example.com/google.jpg',
    );
  });

  test('supports atom feeds with logo artwork', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom podcast</title>
        <logo>https://cdn.example.com/atom-logo.png</logo>
      </feed>`;

    expect(parseRssArtworkUrl(atomXml)).toBe('https://cdn.example.com/atom-logo.png');
  });

  test('returns null for malformed xml or missing artwork', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<rss><channel><title>Invalid XML',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<?xml version="1.0"?><rss><channel><title>Only title</title></channel></rss>',
      });

    await expect(fetchRssArtworkUrl('https://feed.example.com/malformed.xml')).resolves.toBeNull();
    await expect(fetchRssArtworkUrl('https://feed.example.com/no-artwork.xml')).resolves.toBeNull();
  });
});
