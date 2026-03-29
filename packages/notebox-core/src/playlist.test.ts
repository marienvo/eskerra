import {describe, expect, it} from 'vitest';

import {
  isValidPlaylistEntry,
  normalizePlaylistEntryForSync,
  pickNewerPlaylistEntry,
  serializePlaylistEntry,
} from './playlist';

describe('playlist', () => {
  const legacy = {
    durationMs: 1000,
    episodeId: 'e',
    mp3Url: 'https://x/y.mp3',
    positionMs: 1,
  };

  it('accepts legacy JSON without updatedAt', () => {
    expect(isValidPlaylistEntry(legacy)).toBe(true);
    expect(normalizePlaylistEntryForSync(legacy)).toEqual({...legacy, updatedAt: 0});
  });

  it('rejects invalid updatedAt', () => {
    expect(
      isValidPlaylistEntry({
        ...legacy,
        updatedAt: 'x',
      }),
    ).toBe(false);
  });

  it('pickNewerPlaylistEntry prefers higher updatedAt', () => {
    const a = {...legacy, updatedAt: 10};
    const b = {...legacy, updatedAt: 20};
    expect(pickNewerPlaylistEntry(a, b)).toEqual(b);
    expect(pickNewerPlaylistEntry(b, a)).toEqual(b);
  });

  it('pickNewerPlaylistEntry tie prefers second', () => {
    const a = {...legacy, updatedAt: 5};
    const b = {...legacy, episodeId: 'remote', updatedAt: 5};
    expect(pickNewerPlaylistEntry(a, b)).toEqual(b);
  });

  it('serializePlaylistEntry includes updatedAt', () => {
    const entry = {...legacy, updatedAt: 99};
    expect(JSON.parse(serializePlaylistEntry(entry))).toEqual(entry);
  });
});
