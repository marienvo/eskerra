import {describe, expect, it} from 'vitest';

import {
  parseEskerraLocalSettings,
  serializeEskerraLocalSettings,
} from './eskerraLocalSettings';

const emptyLocal = {
  deviceInstanceId: '',
  deviceName: '',
  displayName: '',
  playlistKnownControlRevision: null as null,
  playlistKnownUpdatedAtMs: null as null,
};

describe('parseEskerraLocalSettings', () => {
  it('parses valid local settings', () => {
    expect(
      parseEskerraLocalSettings(JSON.stringify({deviceName: 'Phone'}, null, 2)),
    ).toEqual({...emptyLocal, deviceName: 'Phone'});
  });

  it('defaults missing deviceName to empty string', () => {
    expect(parseEskerraLocalSettings(JSON.stringify({}, null, 2))).toEqual(emptyLocal);
  });

  it('allows empty deviceName', () => {
    expect(parseEskerraLocalSettings(JSON.stringify({deviceName: ''}, null, 2))).toEqual(emptyLocal);
  });

  it('parses displayName', () => {
    expect(
      parseEskerraLocalSettings(
        JSON.stringify({deviceName: 'P', displayName: 'My vault'}, null, 2),
      ),
    ).toEqual({...emptyLocal, deviceName: 'P', displayName: 'My vault'});
  });

  it('parses playlistKnownUpdatedAtMs', () => {
    expect(
      parseEskerraLocalSettings(
        JSON.stringify({...emptyLocal, playlistKnownUpdatedAtMs: 123}, null, 2),
      ),
    ).toEqual({...emptyLocal, playlistKnownUpdatedAtMs: 123});
  });

  it('parses playlistKnownControlRevision', () => {
    expect(
      parseEskerraLocalSettings(
        JSON.stringify({...emptyLocal, playlistKnownControlRevision: 7}, null, 2),
      ),
    ).toEqual({...emptyLocal, playlistKnownControlRevision: 7});
  });

  it('rejects non-object JSON', () => {
    expect(() => parseEskerraLocalSettings('null')).toThrow(/settings-local/);
    expect(() => parseEskerraLocalSettings('[]')).toThrow(/settings-local/);
  });
});

describe('serializeEskerraLocalSettings', () => {
  it('round-trips', () => {
    const s = {
      deviceInstanceId: 'a',
      deviceName: 'X',
      displayName: 'Y',
      playlistKnownControlRevision: 2,
      playlistKnownUpdatedAtMs: 9,
    };
    expect(parseEskerraLocalSettings(serializeEskerraLocalSettings(s))).toEqual(s);
  });
});
