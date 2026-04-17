import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  clearArtworkCacheForTests,
  peekCachedArtworkUri,
  resolveArtworkUri,
  setArtworkCacheEntryForTests,
} from './artworkCacheDesktop';

const FEED = 'https://feed.example.com/podcast.xml';
const ART = 'https://cdn.example.com/cover.jpg';

const minimalRssWithItunes = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>T</title>
    <itunes:image href="${ART}" />
  </channel>
</rss>`;

function mockFetchOnce(okXml: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {get: () => null},
      text: async () => okXml,
    })) as unknown as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearArtworkCacheForTests();
});

describe('artworkCacheDesktop', () => {
  beforeEach(() => {
    clearArtworkCacheForTests();
  });

  it('peek returns undefined when empty', () => {
    expect(peekCachedArtworkUri(FEED)).toBeUndefined();
  });

  it('resolveArtworkUri caches result and peek returns hit', async () => {
    mockFetchOnce(minimalRssWithItunes);
    const url = await resolveArtworkUri(FEED);
    expect(url).toBe(ART);
    expect(peekCachedArtworkUri(FEED)).toBe(ART);
  });

  it('dedupes parallel resolveArtworkUri for same feed', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        await new Promise<void>(r => {
          setTimeout(r, 15);
        });
        return {
          ok: true,
          status: 200,
          headers: {get: () => null},
          text: async () => minimalRssWithItunes,
        };
      }) as unknown as typeof fetch,
    );

    const [a, b] = await Promise.all([
      resolveArtworkUri(FEED),
      resolveArtworkUri(FEED),
    ]);
    expect(a).toBe(ART);
    expect(b).toBe(ART);
    expect(calls).toBe(1);
  });

  it('stale positive cache is ignored by peek and re-fetched', async () => {
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    setArtworkCacheEntryForTests(FEED, {url: ART, fetchedAt: old});
    expect(peekCachedArtworkUri(FEED)).toBeUndefined();

    mockFetchOnce(minimalRssWithItunes);
    const url = await resolveArtworkUri(FEED);
    expect(url).toBe(ART);
    expect(peekCachedArtworkUri(FEED)).toBe(ART);
  });

  it('persists to localStorage after resolve', async () => {
    mockFetchOnce(minimalRssWithItunes);
    await resolveArtworkUri(FEED);
    const raw = localStorage.getItem('eskerra.desktop.artworkCache.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, {url: string | null}>;
    expect(parsed[FEED]?.url).toBe(ART);
  });
});
