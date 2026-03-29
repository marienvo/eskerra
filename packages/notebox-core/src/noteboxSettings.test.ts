import {describe, expect, it} from 'vitest';

import {
  buildNoteboxSettingsFromForm,
  effectiveR2Endpoint,
  parseNoteboxSettings,
  r2S3AccountBaseUrl,
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

  it('parses r2 with EU jurisdiction', () => {
    const raw = JSON.stringify({r2: {...validR2, jurisdiction: 'eu'}}, null, 2);
    expect(parseNoteboxSettings(raw)).toEqual({r2: {...validR2, jurisdiction: 'eu'}});
  });

  it('rejects invalid jurisdiction', () => {
    const raw = JSON.stringify({r2: {...validR2, jurisdiction: 'mars'}}, null, 2);
    expect(() => parseNoteboxSettings(raw)).toThrow(/settings-shared/);
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

  it('persists EU jurisdiction', () => {
    const r = buildNoteboxSettingsFromForm({...validR2, jurisdiction: 'eu'});
    expect(r).toEqual({ok: true, settings: {r2: {...validR2, jurisdiction: 'eu'}}});
  });

  it('omits jurisdiction when default', () => {
    const r = buildNoteboxSettingsFromForm({...validR2, jurisdiction: 'default'});
    expect(r).toEqual({ok: true, settings: {r2: validR2}});
  });
});

describe('effectiveR2Endpoint', () => {
  it('rewrites default hostname for EU jurisdiction', () => {
    expect(
      effectiveR2Endpoint({
        endpoint: 'https://acc.r2.cloudflarestorage.com',
        bucket: 'b',
        accessKeyId: 'k',
        secretAccessKey: 's',
        jurisdiction: 'eu',
      }),
    ).toBe('https://acc.eu.r2.cloudflarestorage.com');
  });

  it('leaves an already EU hostname unchanged', () => {
    expect(
      effectiveR2Endpoint({
        endpoint: 'https://acc.eu.r2.cloudflarestorage.com',
        bucket: 'b',
        accessKeyId: 'k',
        secretAccessKey: 's',
        jurisdiction: 'eu',
      }),
    ).toBe('https://acc.eu.r2.cloudflarestorage.com');
  });
});

describe('r2S3AccountBaseUrl', () => {
  it('strips trailing /bucket copied from Cloudflare S3 URL', () => {
    expect(
      r2S3AccountBaseUrl({
        endpoint: 'https://acc.eu.r2.cloudflarestorage.com/notebox',
        bucket: 'notebox',
        accessKeyId: 'k',
        secretAccessKey: 's',
        jurisdiction: 'eu',
      }),
    ).toBe('https://acc.eu.r2.cloudflarestorage.com');
  });

  it('keeps unusual path segments (does not strip)', () => {
    expect(
      r2S3AccountBaseUrl({
        endpoint: 'https://acc.eu.r2.cloudflarestorage.com/other/prefix',
        bucket: 'notebox',
        accessKeyId: 'k',
        secretAccessKey: 's',
      }),
    ).toBe('https://acc.eu.r2.cloudflarestorage.com/other/prefix');
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
