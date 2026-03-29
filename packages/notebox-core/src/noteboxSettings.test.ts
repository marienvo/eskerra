import {describe, expect, it} from 'vitest';

import {parseNoteboxSettings, serializeNoteboxSettings} from './noteboxSettings';

describe('parseNoteboxSettings', () => {
  it('parses valid settings', () => {
    expect(
      parseNoteboxSettings(JSON.stringify({displayName: 'Hi'}, null, 2)),
    ).toEqual({displayName: 'Hi'});
  });

  it('rejects invalid structure', () => {
    expect(() => parseNoteboxSettings('{}')).toThrow(/invalid structure/);
  });
});

describe('serializeNoteboxSettings', () => {
  it('round-trips', () => {
    const s = {displayName: 'X'};
    expect(parseNoteboxSettings(serializeNoteboxSettings(s))).toEqual(s);
  });
});
