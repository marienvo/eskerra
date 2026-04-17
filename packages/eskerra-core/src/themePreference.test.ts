import {describe, expect, it} from 'vitest';

import {
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  parseThemePreferenceOrThrow,
  serializeThemePreference,
} from './themePreference';

describe('parseThemePreference', () => {
  it('parses valid preference', () => {
    expect(parseThemePreference({themeId: 'x', mode: 'auto'})).toEqual({themeId: 'x', mode: 'auto'});
  });

  it('trims themeId', () => {
    expect(parseThemePreference({themeId: '  y  ', mode: 'light'})).toEqual({themeId: 'y', mode: 'light'});
  });

  it('returns null for invalid', () => {
    expect(parseThemePreference({themeId: '', mode: 'auto'})).toBeNull();
    expect(parseThemePreference({themeId: 'a', mode: 'dim'})).toBeNull();
  });
});

describe('parseThemePreferenceOrThrow', () => {
  it('throws on invalid', () => {
    expect(() => parseThemePreferenceOrThrow({})).toThrow();
  });
});

describe('serializeThemePreference', () => {
  it('round-trips', () => {
    const s = serializeThemePreference(DEFAULT_THEME_PREFERENCE);
    expect(parseThemePreference(JSON.parse(s))).toEqual(DEFAULT_THEME_PREFERENCE);
  });
});
