import type {ThemeDefinition} from './schema';

export const BUNDLED_ESKERRA_DEFAULT: ThemeDefinition = {
  id: 'eskerra-default',
  name: 'Eskerra Default',
  source: 'bundled',
  dark: {palette: ['#031226', '#11538C', '#11A0D9', '#41CAD9', '#B3F2D5']},
  light: {palette: ['#F5F8FB', '#C8DAEA', '#8FBDE0', '#5FA6D1', '#E0F2E6']},
};

export const BUNDLED_ASH: ThemeDefinition = {
  id: 'ash',
  name: 'Ash',
  source: 'bundled',
  dark: {palette: ['#282828']},
  light: {palette: ['#E7E7E7']},
};

export const BUNDLED_BLOSSOM: ThemeDefinition = {
  id: 'blossom',
  name: 'Blossom',
  source: 'bundled',
  dark: {palette: ['#1A0A12', '#5C1F3A', '#C43F70', '#F07AAA']},
  light: {palette: ['#FFF5F8', '#FAD6E4', '#F0A8C4',  '#F8E1EE']},
};

export const BUNDLED_EMBER: ThemeDefinition = {
  id: 'ember',
  name: 'Ember',
  source: 'bundled',
  dark: {palette: ['#150900', '#7A2800', '#CC5500', '#F0921E',  '#F5D090']},
  light: {palette: ['#FBF5EA', '#F8E4C0', '#ECC47E',   '#F8E4C0','#F0D5A5']},
};

export const BUNDLED_THEMES: readonly ThemeDefinition[] = [
  BUNDLED_ESKERRA_DEFAULT,
  BUNDLED_ASH,
  BUNDLED_BLOSSOM,
  BUNDLED_EMBER,
] as const;

export function getBundledThemeById(id: string): ThemeDefinition | undefined {
  return BUNDLED_THEMES.find(t => t.id === id);
}
