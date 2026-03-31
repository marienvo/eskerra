import {isTauri} from '@tauri-apps/api/core';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {useLayoutEffect, useState} from 'react';

import App from './App.tsx';
import {SettingsWindowApp} from './components/SettingsWindowApp';
import {SETTINGS_WINDOW_LABEL} from './lib/openSettingsWindow';

function initialRootView(): 'main' | 'settings' {
  if (!isTauri()) {
    return 'main';
  }
  try {
    return WebviewWindow.getCurrent().label === SETTINGS_WINDOW_LABEL ? 'settings' : 'main';
  } catch {
    return 'main';
  }
}

export function AppRoot() {
  const [view] = useState(initialRootView);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const useTransparentChrome = isTauri() && view === 'main';
    if (useTransparentChrome) {
      root.classList.add('tauri-main-chrome');
      return () => {
        root.classList.remove('tauri-main-chrome');
      };
    }
    root.classList.remove('tauri-main-chrome');
  }, [view]);

  return view === 'settings' ? <SettingsWindowApp /> : <App />;
}
