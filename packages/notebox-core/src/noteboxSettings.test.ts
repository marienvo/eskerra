import {describe, expect, it} from 'vitest';

import {
  buildNoteboxSettingsFromForm,
  parseNoteboxSettings,
  serializeNoteboxSettings,
} from './noteboxSettings';

const validR2 = {
  endpoint: 'https://example.r2.cloudflarestorage.com',
  bucket: 'b',
  accessKeyId: 'k',
  secretAccessKey: 's',
};

describe('parseNoteboxSettings', () => {
  it('parses empty shared object', () => {
    expect(parseNoteboxSettings(JSON.stringify({}, null, 2))).toEqual({});
  });

  it('ignores legacy displayName', () => {
    expect(
      parseNoteboxSettings(JSON.stringify({displayName: 'Hi'}, null, 2)),
    ).toEqual({});
  });

  it('parses settings with r2 block only', () => {
    const raw = JSON.stringify({displayName: 'Hi', r2: validR2}, null, 2);
    expect(parseNoteboxSettings(raw)).toEqual({r2: validR2});
  });

  it('rejects malformed r2', () => {
    const raw = JSON.stringify({displayName: 'Hi', r2: {endpoint: 'x'}}, null, 2);
    expect(() => parseNoteboxSettings(raw)).toThrow(/settings-shared/);
  });

  it('rejects invalid structure', () => {
    expect(() => parseNoteboxSettings('null')).toThrow(/settings-shared/);
  });
});

describe('buildNoteboxSettingsFromForm', () => {
  const emptyR2 = {endpoint: '', bucket: '', accessKeyId: '', secretAccessKey: ''};

  it('omits r2 when all fields empty', () => {
    const r = buildNoteboxSettingsFromForm(emptyR2);
    expect(r).toEqual({ok: true, settings: {}});
  });

  it('requires all r2 fields when any set', () => {
    const r = buildNoteboxSettingsFromForm({
      endpoint: 'https://x',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    });
    expect(r.ok).toBe(false);
  });

  it('includes r2 when all set', () => {
    const r = buildNoteboxSettingsFromForm({...validR2});
    expect(r).toEqual({ok: true, settings: {r2: validR2}});
  });
});

describe('serializeNoteboxSettings', () => {
  it('round-trips without r2', () => {
    const s = {};
    expect(parseNoteboxSettings(serializeNoteboxSettings(s))).toEqual(s);
  });

  it('round-trips with r2', () => {
    const s = {r2: validR2};
    expect(parseNoteboxSettings(serializeNoteboxSettings(s))).toEqual(s);
  });
});
