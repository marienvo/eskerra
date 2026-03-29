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

  test('parses realistic Bureau Buitenland feed metadata', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"
           xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
           xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Bureau Buitenland</title>
          <description><![CDATA[Wereldse achtergronden en analyses]]></description>
          <itunes:image href="https://images.npo.nl/image/upload/v1738772223/bureau-buitenland.jpg" />
          <media:thumbnail url="https://images.npo.nl/image/upload/v1738772223/bureau-buitenland-thumb.jpg" />
        </channel>
      </rss>`;

    expect(parseRssArtworkUrl(xml)).toBe(
      'https://images.npo.nl/image/upload/v1738772223/bureau-buitenland.jpg',
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

  test('falls back to full RSS fetch when range response is partial and missing artwork', async () => {
    fetchMock
      .mockResolvedValueOnce({
        headers: {get: (name: string) => (name === 'content-range' ? 'bytes 0-16383/64000' : null)},
        ok: true,
        status: 206,
        text: async () => '<?xml version="1.0"?><rss><channel><title>Partial</title></channel></rss>',
      })
      .mockResolvedValueOnce({
        headers: {get: () => null},
        ok: true,
        status: 200,
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
            <channel>
              <itunes:image href="https://cdn.example.com/full-cover.jpg" />
            </channel>
          </rss>`,
      });

    await expect(fetchRssArtworkUrl('https://feed.example.com/partial.xml')).resolves.toBe(
      'https://cdn.example.com/full-cover.jpg',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('parseRssArtworkUrl golden fixture feeds', () => {
  const readFileSync = (filePath: string, encoding: string) =>
    (require('fs') as {readFileSync: (path: string, fileEncoding: string) => string}).readFileSync(
      filePath,
      encoding,
    );
  const fixtureCases = [
    {
      expectedArtworkUrl:
        'https://www.omnycontent.com/d/programs/8257a063-6be9-42fa-b892-acd4013b1255/37c1e050-5aa0-426e-a111-ade100aaee21/image.jpg?t=1740054152&size=Large',
      fileName: 'broken-1.rss',
    },
    {
      expectedArtworkUrl:
        'https://www.omnycontent.com/d/programs/8257a063-6be9-42fa-b892-acd4013b1255/183dc0a5-9b77-48f3-9970-acef00cf8471/image.jpg?t=1669297540&size=Large',
      fileName: 'broken-2.rss',
    },
    {
      expectedArtworkUrl:
        'https://podcast.npo.nl/data/thumb/buitenhof.1400.918015ca7832e6a442c0f5d897a84455.jpg',
      fileName: 'broken-3.xml',
    },
    {
      expectedArtworkUrl:
        'https://www.omnycontent.com/d/playlist/8257a063-6be9-42fa-b892-acd4013b1255/610ea01a-74cf-4975-8b03-adc100b256df/7e661a5d-0bed-4a3e-a173-b25000a622dd/image.jpg?t=1763031192&size=Large',
      fileName: 'broken-4.rss',
    },
    {
      expectedArtworkUrl:
        'https://www.omnycontent.com/d/programs/8257a063-6be9-42fa-b892-acd4013b1255/9d240ce9-0f7e-404e-b6ff-acef00cc3972/image.jpg?t=1667822705&size=Large',
      fileName: 'broken-5.rss',
    },
    {
      expectedArtworkUrl:
        'https://content.production.cdn.art19.com/images/2e/d0/18/ab/2ed018ab-e157-4212-9f27-910ee353f0e1/91502b4bd0fde49ef44f4d5a3d8bc772ebc052dc6a2a3fea3f1473035e78fa243366aaf45d3376d959c28075262335c58da6cf79c1cf6890be2ee46354818675.jpeg',
      fileName: 'broken-6.rss',
    },
    {
      expectedArtworkUrl:
        'https://podcast.npo.nl/data/thumb/bureau-buitenland.1400.a452fdafea0ee47a2b1c6d098d0cb7ee.jpg',
      fileName: 'ok-1.xml',
    },
    {
      expectedArtworkUrl:
        'https://podcast.npo.nl/data/thumb/de-jortcast.1400.67ed6d57fa4ade49b05029db0eea94f7.jpg',
      fileName: 'ok-2.xml',
    },
    {
      expectedArtworkUrl:
        'https://podcast.npo.nl/data/thumb/keeenvanjole.1400.120faa2507381428c2cbdaa2ec14fa9d.jpg',
      fileName: 'ok-3.xml',
    },
  ] as const;

  test.each(fixtureCases)(
    'extracts artwork from $fileName',
    ({expectedArtworkUrl, fileName}) => {
      const xml = readFileSync(`__mocks__/rss-feeds/${fileName}`, 'utf8');
      expect(parseRssArtworkUrl(xml)).toBe(expectedArtworkUrl);
    },
  );
});
