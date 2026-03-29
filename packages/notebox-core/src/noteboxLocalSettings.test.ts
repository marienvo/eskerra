import {describe, expect, it} from 'vitest';

import {
  parseNoteboxLocalSettings,
  serializeNoteboxLocalSettings,
} from './noteboxLocalSettings';

const emptyLocal = {deviceName: '', displayName: '', playlistKnownUpdatedAtMs: null as null};

describe('parseNoteboxLocalSettings', () => {
  it('parses valid local settings', () => {
    expect(
      parseNoteboxLocalSettings(JSON.stringify({deviceName: 'Phone'}, null, 2)),
    ).toEqual({deviceName: 'Phone', displayName: '', playlistKnownUpdatedAtMs: null});
  });

  it('defaults missing deviceName to empty string', () => {
    expect(parseNoteboxLocalSettings(JSON.stringify({}, null, 2))).toEqual(emptyLocal);
  });

  it('allows empty deviceName', () => {
    expect(parseNoteboxLocalSettings(JSON.stringify({deviceName: ''}, null, 2))).toEqual(emptyLocal);
  });

  it('parses displayName', () => {
    expect(
      parseNoteboxLocalSettings(
        JSON.stringify({deviceName: 'P', displayName: 'My vault'}, null, 2),
      ),
    ).toEqual({deviceName: 'P', displayName: 'My vault', playlistKnownUpdatedAtMs: null});
  });

  it('parses playlistKnownUpdatedAtMs', () => {
    expect(
      parseNoteboxLocalSettings(
        JSON.stringify({...emptyLocal, playlistKnownUpdatedAtMs: 123}, null, 2),
      ),
    ).toEqual({...emptyLocal, playlistKnownUpdatedAtMs: 123});
  });

  it('rejects non-object JSON', () => {
    expect(() => parseNoteboxLocalSettings('null')).toThrow(/settings-local/);
    expect(() => parseNoteboxLocalSettings('[]')).toThrow(/settings-local/);
  });
});

describe('serializeNoteboxLocalSettings', () => {
  it('round-trips', () => {
    const s = {deviceName: 'X', displayName: 'Y', playlistKnownUpdatedAtMs: 9};
    expect(parseNoteboxLocalSettings(serializeNoteboxLocalSettings(s))).toEqual(s);
  });
});
