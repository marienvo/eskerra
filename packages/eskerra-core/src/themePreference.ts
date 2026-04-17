export type ThemeMode = 'light' | 'dark' | 'auto';

export type ThemePreference = {
  themeId: string;
  mode: ThemeMode;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeId: 'eskerra-default',
  mode: 'auto',
};

export function parseThemePreference(value: unknown): ThemePreference | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.themeId !== 'string' || o.themeId.trim() === '') {
    return null;
  }
  const mode = o.mode;
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') {
    return null;
  }
  return {themeId: o.themeId.trim(), mode};
}

export function parseThemePreferenceOrThrow(value: unknown): ThemePreference {
  const p = parseThemePreference(value);
  if (!p) {
    throw new Error('themePreference has an invalid structure.');
  }
  return p;
}

export function serializeThemePreference(pref: ThemePreference): string {
  return `${JSON.stringify(pref, null, 2)}\n`;
}
