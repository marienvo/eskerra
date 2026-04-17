import {createContext, useContext} from 'react';

import type {ThemeDefinition, ThemeMode, ThemePreference, VaultThemeListItem} from '@eskerra/core';

export type ThemeShellContextValue = {
  preference: ThemePreference;
  resolvedMode: 'light' | 'dark';
  activeTheme: ThemeDefinition;
  /** Palette for the current resolved mode (passed to AppChromeBackground). */
  chromePalette: readonly string[];
  themesById: ReadonlyMap<string, ThemeDefinition>;
  vaultThemeItems: VaultThemeListItem[];
  setThemeId: (themeId: string) => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
};

export const ThemeShellContext = createContext<ThemeShellContextValue | null>(null);

export function useThemeShell(): ThemeShellContextValue {
  const v = useContext(ThemeShellContext);
  if (!v) {
    throw new Error('useThemeShell must be used within ThemeProvider');
  }
  return v;
}
