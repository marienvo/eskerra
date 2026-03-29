import {describe, expect, it} from 'vitest';

import {
  parseNoteboxLocalSettings,
  serializeNoteboxLocalSettings,
} from './noteboxLocalSettings';

describe('parseNoteboxLocalSettings', () => {
  it('parses valid local settings', () => {
    expect(
      parseNoteboxLocalSettings(JSON.stringify({deviceName: 'Phone'}, null, 2)),
    ).toEqual({deviceName: 'Phone', displayName: ''});
  });

  it('defaults missing deviceName to empty string', () => {
    expect(parseNoteboxLocalSettings(JSON.stringify({}, null, 2))).toEqual({
      deviceName: '',
      displayName: '',
    });
  });

  it('allows empty deviceName', () => {
    expect(parseNoteboxLocalSettings(JSON.stringify({deviceName: ''}, null, 2))).toEqual({
      deviceName: '',
      displayName: '',
    });
  });

  it('parses displayName', () => {
    expect(
      parseNoteboxLocalSettings(
        JSON.stringify({deviceName: 'P', displayName: 'My vault'}, null, 2),
      ),
    ).toEqual({deviceName: 'P', displayName: 'My vault'});
  });

  it('rejects non-object JSON', () => {
    expect(() => parseNoteboxLocalSettings('null')).toThrow(/settings-local/);
    expect(() => parseNoteboxLocalSettings('[]')).toThrow(/settings-local/);
  });
});

describe('serializeNoteboxLocalSettings', () => {
  it('round-trips', () => {
    const s = {deviceName: 'X', displayName: 'Y'};
    expect(parseNoteboxLocalSettings(serializeNoteboxLocalSettings(s))).toEqual(s);
  });
});
