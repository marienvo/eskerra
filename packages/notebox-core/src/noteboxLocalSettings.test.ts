import {describe, expect, it} from 'vitest';

import {
  parseNoteboxLocalSettings,
  serializeNoteboxLocalSettings,
} from './noteboxLocalSettings';

describe('parseNoteboxLocalSettings', () => {
  it('parses valid local settings', () => {
    expect(
      parseNoteboxLocalSettings(JSON.stringify({deviceName: 'Phone'}, null, 2)),
    ).toEqual({deviceName: 'Phone'});
  });

  it('rejects invalid structure', () => {
    expect(() => parseNoteboxLocalSettings('{}')).toThrow(/settings-local/);
  });
});

describe('serializeNoteboxLocalSettings', () => {
  it('round-trips', () => {
    const s = {deviceName: 'X'};
    expect(parseNoteboxLocalSettings(serializeNoteboxLocalSettings(s))).toEqual(s);
  });
});
