import {AppChromeBackground} from '../components/AppChromeBackground';

import {useThemeShell} from './themeShellContext';

export function ThemedChromeBackground() {
  const {chromePalette} = useThemeShell();
  return <AppChromeBackground palette={chromePalette} />;
}
