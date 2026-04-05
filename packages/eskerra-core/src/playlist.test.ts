import {describe, expect, it} from 'vitest';

import {
  isPlaylistR2PollEchoFromOwnDevice,
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
    expect(normalizePlaylistEntryForSync(legacy)).toEqual({
      ...legacy,
      controlRevision: 0,
      playbackOwnerId: '',
      updatedAt: 0,
    });
  });

  it('rejects invalid updatedAt', () => {
    expect(
      isValidPlaylistEntry({
        ...legacy,
        updatedAt: 'x',
      }),
    ).toBe(false);
  });

  it('pickNewerPlaylistEntry prefers higher controlRevision', () => {
    const a = {...legacy, controlRevision: 1, updatedAt: 10, playbackOwnerId: ''};
    const b = {...legacy, controlRevision: 2, updatedAt: 5, playbackOwnerId: ''};
    expect(pickNewerPlaylistEntry(a, b)).toEqual(b);
    expect(pickNewerPlaylistEntry(b, a)).toEqual(b);
  });

  it('pickNewerPlaylistEntry prefers higher updatedAt when controlRevision ties', () => {
    const a = {...legacy, controlRevision: 1, updatedAt: 10, playbackOwnerId: ''};
    const b = {...legacy, controlRevision: 1, updatedAt: 20, playbackOwnerId: ''};
    expect(pickNewerPlaylistEntry(a, b)).toEqual(b);
    expect(pickNewerPlaylistEntry(b, a)).toEqual(b);
  });

  it('pickNewerPlaylistEntry tie prefers second', () => {
    const a = {...legacy, controlRevision: 1, updatedAt: 5, playbackOwnerId: ''};
    const b = {...legacy, controlRevision: 1, episodeId: 'remote', updatedAt: 5, playbackOwnerId: ''};
    expect(pickNewerPlaylistEntry(a, b)).toEqual(b);
  });

  it('serializePlaylistEntry includes updatedAt', () => {
    const entry = {...legacy, controlRevision: 0, playbackOwnerId: '', updatedAt: 99};
    expect(JSON.parse(serializePlaylistEntry(entry))).toEqual(entry);
  });

  it('isPlaylistR2PollEchoFromOwnDevice true only when owner matches non-empty device id', () => {
    const entry = {...legacy, controlRevision: 1, playbackOwnerId: 'device-a', updatedAt: 1};
    expect(isPlaylistR2PollEchoFromOwnDevice(entry, 'device-a')).toBe(true);
    expect(isPlaylistR2PollEchoFromOwnDevice(entry, 'device-b')).toBe(false);
    expect(
      isPlaylistR2PollEchoFromOwnDevice({...entry, playbackOwnerId: ''}, 'device-a'),
    ).toBe(false);
    expect(isPlaylistR2PollEchoFromOwnDevice(entry, '')).toBe(false);
    expect(isPlaylistR2PollEchoFromOwnDevice(entry, '  device-a  ')).toBe(true);
  });
});
