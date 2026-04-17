import type {ThemeDefinition} from './schema';

export const BUNDLED_ESKERRA_DEFAULT: ThemeDefinition = {
  id: 'eskerra-default',
  name: 'Eskerra Default',
  source: 'bundled',
  dark: {palette: ['#031226', '#11538C', '#11A0D9', '#41CAD9', '#B3F2D5']},
  light: {palette: ['#F5F8FB', '#C8DAEA', '#8FBDE0', '#5FA6D1', '#E0F2E6']},
};

export const BUNDLED_THEMES: readonly ThemeDefinition[] = [BUNDLED_ESKERRA_DEFAULT] as const;

export function getBundledThemeById(id: string): ThemeDefinition | undefined {
  return BUNDLED_THEMES.find(t => t.id === id);
}
