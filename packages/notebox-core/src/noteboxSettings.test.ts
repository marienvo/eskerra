import {describe, expect, it} from 'vitest';

import {parseNoteboxSettings, serializeNoteboxSettings} from './noteboxSettings';

const validR2 = {
  endpoint: 'https://example.r2.cloudflarestorage.com',
  bucket: 'b',
  accessKeyId: 'k',
  secretAccessKey: 's',
};

describe('parseNoteboxSettings', () => {
  it('parses valid settings', () => {
    expect(
      parseNoteboxSettings(JSON.stringify({displayName: 'Hi'}, null, 2)),
    ).toEqual({displayName: 'Hi'});
  });

  it('parses settings with r2 block', () => {
    const raw = JSON.stringify({displayName: 'Hi', r2: validR2}, null, 2);
    expect(parseNoteboxSettings(raw)).toEqual({
      displayName: 'Hi',
      r2: validR2,
    });
  });

  it('rejects malformed r2', () => {
    const raw = JSON.stringify({displayName: 'Hi', r2: {endpoint: 'x'}}, null, 2);
    expect(() => parseNoteboxSettings(raw)).toThrow(/settings-shared/);
  });

  it('rejects invalid structure', () => {
    expect(() => parseNoteboxSettings('{}')).toThrow(/settings-shared/);
  });
});

describe('serializeNoteboxSettings', () => {
  it('round-trips without r2', () => {
    const s = {displayName: 'X'};
    expect(parseNoteboxSettings(serializeNoteboxSettings(s))).toEqual(s);
  });

  it('round-trips with r2', () => {
    const s = {displayName: 'X', r2: validR2};
    expect(parseNoteboxSettings(serializeNoteboxSettings(s))).toEqual(s);
  });
});
