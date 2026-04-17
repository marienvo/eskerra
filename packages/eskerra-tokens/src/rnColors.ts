import {calmEditorial} from './calmEditorial';
import {desktopBrand} from './desktopBrand';

/**
 * React Native color strings (hex / rgb) aligned with calm editorial + mobile accent.
 * Use with StyleSheet.create({ ... }) from apps/mobile.
 */
export const rnColors = {
  ...calmEditorial,
  appChromeBackdrop: desktopBrand.appChromeBackdrop,
  brandBackground: desktopBrand.brandBackground,
  /** Same as calm editorial accent; matches apps/mobile/src/core/ui/accentColor.ts */
  accentUi: '#4FAFE6',
} as const;

export type RnColorKey = keyof typeof rnColors;
